// A real browser, driven over the Chrome DevTools Protocol.
//
// The injected head script exists to intercept history.pushState and rewrite
// what the address bar shows. Everything about that is browser behaviour: a
// real History API, a real Location, a real same-origin policy. Running it in a
// vm sandbox — which is what test/head-js.test.mjs does — checks the logic but
// cannot check that the interception actually takes effect.
//
// Node 24 ships a WebSocket client, so CDP needs no dependency. Chrome itself
// is optional: without it these tests skip rather than fail, because a
// contributor should not need a browser installed to run the suite.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const WINDOWS = process.platform === 'win32';
const MACOS = process.platform === 'darwin';

const CANDIDATES = [
  process.env.NOOXY_CHROME,
  ...(WINDOWS
    ? [
        `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : []),
  ...(MACOS
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : []),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/** Chrome shipped with playwright or puppeteer, if either has been installed. */
function cachedBrowsers() {
  const found = [];
  // Each cache lays its downloads out per platform.
  const layouts = WINDOWS
    ? [
        ['.cache/ms-playwright', 'chrome-win/chrome.exe'],
        ['.cache/puppeteer', 'chrome-win64/chrome.exe'],
      ]
    : MACOS
      ? [
          ['.cache/ms-playwright', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'],
          ['.cache/puppeteer', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
        ]
      : [
          ['.cache/ms-playwright', 'chrome-linux/headless_shell'],
          ['.cache/ms-playwright', 'chrome-linux/chrome'],
          ['.cache/puppeteer', 'chrome-linux64/chrome'],
        ];

  for (const [cache, pattern] of layouts) {
    const root = path.join(os.homedir(), cache);
    if (!fs.existsSync(root)) {
      continue;
    }
    for (const entry of fs.readdirSync(root)) {
      found.push(path.join(root, entry, pattern));
    }
  }
  return found;
}

export function findChrome() {
  for (const candidate of [...CANDIDATES, ...cachedBrowsers()]) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export const chromePath = findChrome();
export const skipWithoutChrome = chromePath ? false : 'no Chrome found — set NOOXY_CHROME to run these';

/** Serves a single HTML document, so the page has a real http:// origin. */
async function serve(html) {
  const server = http.createServer((request, response) => {
    if (request.url === '/' || request.url.startsWith('/?')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html);
      return;
    }
    // Notion's own bundles are referenced by the rewritten page and are not
    // available here. 204 keeps the console quiet without stalling the load.
    response.writeHead(204);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

// A command that never gets a reply must not wedge the run. node --test has no
// per-test timeout by default, so an unanswered send would hang until the whole
// job was killed — and the polling loop below cannot notice, because its deadline
// is checked after the await, not during it.
const COMMAND_TIMEOUT_MS = 20000;

/** Minimal CDP client: send a command, await its reply. */
function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  let failure = null;

  /** Rejects every in-flight command; a dead socket will never answer them. */
  const abortAll = (reason) => {
    failure ??= reason;
    for (const [id, settle] of pending) {
      pending.delete(id);
      settle.reject(reason);
    }
  };

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  // After `ready` resolves these are the only things that can report a dead
  // socket, and without them the pending promises simply never settled.
  socket.addEventListener('error', () => abortAll(new Error('CDP socket failed')));
  socket.addEventListener('close', () => abortAll(new Error('CDP socket closed')));

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const settle = pending.get(message.id);
    if (settle) {
      pending.delete(message.id);
      message.error ? settle.reject(new Error(message.error.message)) : settle.resolve(message.result);
    }
  });

  return {
    ready,
    send(method, params, sessionId) {
      if (failure) {
        return Promise.reject(failure);
      }
      const id = nextId++;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP command timed out after ${COMMAND_TIMEOUT_MS}ms: ${method}`));
        }, COMMAND_TIMEOUT_MS);

        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    close: () => socket.close(),
  };
}

/**
 * Waits for Chrome to print the DevTools endpoint it chose.
 *
 * A Chrome that cannot start — a missing shared library, an unusable profile —
 * exits immediately having explained itself on stderr. Without the exit and error
 * listeners this waited the full 20 seconds and then reported "did not report a
 * DevTools endpoint", discarding the actual reason, once per browser test.
 */
function debuggerUrl(chrome) {
  return new Promise((resolve, reject) => {
    let buffered = '';
    const finish = (error, value) => {
      clearTimeout(timer);
      chrome.off('exit', onExit);
      chrome.off('error', onError);
      error ? reject(error) : resolve(value);
    };

    const detail = () => (buffered.trim() ? `\n${buffered.trim().split('\n').slice(-10).join('\n')}` : '');
    const onExit = (code, signal) =>
      finish(
        new Error(`Chrome exited before reporting a DevTools endpoint (code ${code}, signal ${signal})${detail()}`),
      );
    const onError = (error) => finish(new Error(`Chrome could not be started: ${error.message}`));
    const timer = setTimeout(
      () => finish(new Error(`Chrome did not report a DevTools endpoint within 20s${detail()}`)),
      20000,
    );

    chrome.once('exit', onExit);
    chrome.once('error', onError);
    chrome.stderr.on('data', (chunk) => {
      buffered += chunk;
      const match = buffered.match(/ws:\/\/\S+/);
      if (match) {
        finish(null, match[0]);
      }
    });
  });
}

/**
 * Loads `html` in a real browser and hands back an `evaluate` function.
 *
 * @param {string} html - the document to serve
 * @param {(evaluate: (expression: string) => Promise<unknown>, origin: string) => Promise<void>} run
 */
export async function withPage(html, run) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nooxy-chrome-'));
  profiles.add(profile);
  const { server, origin } = await serve(html);

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);

  let client;
  try {
    client = connect(await debuggerUrl(chrome));
    await client.ready;

    // The target is created blank and navigated afterwards. Creating it
    // directly at `origin` returns as soon as the target exists, so the first
    // evaluate can land on about:blank — whose readyState is already
    // 'complete', which makes a naive wait pass against the wrong document.
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    await client.send('Page.enable', {}, sessionId);
    await client.send('Page.navigate', { url: origin }, sessionId);

    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await client.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value;
    };

    // Wait for the served document specifically, not merely for *a* document to
    // be ready. Polling both conditions is what stops about:blank counting.
    const deadline = Date.now() + 20000;
    while ((await evaluate('location.origin')) !== origin || (await evaluate('document.readyState')) !== 'complete') {
      if (Date.now() > deadline) {
        throw new Error(`the page never loaded ${origin}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await run(evaluate, origin);
  } finally {
    await shutDown(chrome, client);
    server.close();
    removeProfile(profile);
  }
}

/**
 * Stops Chrome and waits for it to actually be gone.
 *
 * Browser.close first, because SIGKILL on the parent leaves the renderer, GPU
 * and network-service children running for a moment — and those children are
 * what keep writing into the profile directory. Killing the parent and deleting
 * the profile immediately is a race, which is exactly how this became flaky.
 */
async function shutDown(chrome, client) {
  const hasExited = () => chrome.exitCode !== null || chrome.signalCode !== null;

  try {
    // Bounded: a wedged browser must not hang the suite.
    await Promise.race([
      client?.send('Browser.close') ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    // Already gone, or the socket died first. SIGKILL below covers it.
  }

  client?.close();

  if (!hasExited()) {
    chrome.kill('SIGKILL');
  }

  // `once('exit')` never fires if the process has already exited, so checking
  // first is what stops this awaiting forever.
  if (!hasExited()) {
    await new Promise((resolve) => chrome.once('exit', resolve));
  }
}

/** Every profile this process has created, so none can be left behind. */
const profiles = new Set();

/**
 * Deletes a throwaway profile, tolerating both the lingering-writer race and
 * outright failure.
 *
 * A temp directory that will not delete says nothing about the code under test,
 * so it must never fail a test that has already passed — it used to, with
 * ENOTEMPTY, because Chrome's renderer and GPU children go on writing into the
 * profile for a moment after the parent is gone.
 *
 * Even with retries this cannot always win: the delete succeeds and a surviving
 * child then recreates the directory. That is why it is best-effort here and
 * guaranteed by cleanUpProfiles() once every browser has exited.
 */
function removeProfile(profile) {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    return !fs.existsSync(profile);
  } catch {
    return false;
  }
}

/**
 * Removes anything the per-run cleanup could not. Call from a test.after hook;
 * by then every Chrome has exited, so there is nothing left to race.
 */
export function cleanUpProfiles() {
  const stubborn = [...profiles].filter((profile) => fs.existsSync(profile) && !removeProfile(profile));
  profiles.clear();
  if (stubborn.length > 0) {
    console.warn(`could not remove ${stubborn.length} temporary Chrome profile(s): ${stubborn.join(', ')}`);
  }
}

/**
 * Deletes every profile this process created. Must stay synchronous: nothing
 * async runs during 'exit'.
 *
 * Retries for the same reason removeProfile does — Chrome's renderer and GPU
 * children go on writing into the profile for a moment after the parent is gone,
 * so a bare rmSync loses that race and silently gives up. The budget is smaller
 * than removeProfile's because this runs at shutdown, where being slow is its own
 * problem.
 */
function sweepProfiles() {
  for (const profile of profiles) {
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Nothing useful to do while the process is on its way out.
    }
  }
}

// Safety net for a normal exit, an uncaught throw, or an explicit process.exit().
// A normal run never needs it — test.after(cleanUpProfiles) has already run.
//
// Deliberately no SIGINT/SIGTERM handlers here. 'exit' does not fire on a signal,
// so adding them looks obviously right, and it was tried: measured against a group
// signal (what Ctrl-C actually sends) the profile count was 0 either way, because
// Chrome receives the same signal and the surviving directory is swept by the
// `finally` in withPage. Signalling only the runner's pid instead leaves the child
// that owns the profiles unreachable, so a handler here cannot help there either.
// Complexity that cannot be shown to do anything is not worth carrying.
//
// A `kill -9`, and a runner killed without its children, can still leave a
// directory behind. Remove them with:  rm -rf /tmp/nooxy-chrome-*
process.on('exit', sweepProfiles);
