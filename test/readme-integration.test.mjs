// The integration snippets in README.md, executed.
//
// The Node.js example is how every self-hosted user wires nooxy up, and it was
// wrong in two ways that no test could see: it never forwarded the request body,
// so Notion's POST /api/v3/... calls arrived empty and pages rendered as an
// empty shell; and it flattened Set-Cookie through headers.forEach(), so a
// signed-in reader lost every cookie but the last.
//
// Documentation that is only read drifts. This extracts the fenced block
// straight out of README.md, rewrites nothing but the import specifiers, and
// runs it against a stubbed upstream — so the published instructions cannot go
// stale without a test going red.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/generated.mjs';
import { skip } from './helpers/harness.mjs';

const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/** Pulls the fenced code block that follows a bolded heading such as **Node.js (22+):** */
function snippetAfter(heading) {
  const start = README.indexOf(heading);
  assert.notEqual(start, -1, `README no longer contains ${heading}`);
  const fence = README.indexOf('```', start);
  const open = README.indexOf('\n', fence) + 1;
  const close = README.indexOf('```', open);
  assert.ok(close > open, `no closing fence after ${heading}`);
  return README.slice(open, close);
}

const temporary = [];

/**
 * A port nobody is listening on.
 *
 * The published snippet reads process.env.PORT, so the test picks a free one
 * rather than racing whatever is on 8787 — the port the README itself tells
 * people to run their dev server on. Binding to 0 lets the OS choose, and the
 * address is only known once the socket is listening, hence the await.
 */
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Runs a snippet in its own file, with a stubbed upstream and a driver appended. */
function runSnippet(snippet, driver, port) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nooxy-readme-')), 'snippet.mjs');
  temporary.push(path.dirname(file));

  // pathToFileURL, not a raw path: on Windows a path is backslash-separated and
  // drive-prefixed, which is not a valid ESM specifier.
  const distUrl = pathToFileURL(path.join(ROOT, 'dist/index.js')).href;
  const wired = snippet
    .replace(/from '(nooxy)'/, `from '${distUrl}'`)
    // The snippet imports the user's own config; supply one inline instead.
    .replace(/import \{ SITE_CONFIG \} from '[^']*';?/, '');

  fs.writeFileSync(file, `${prelude(port)}\n${wired}\n${driver(port)}`);
  // PORT is what the published snippet binds to.
  return execFileSync(process.execPath, [file], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, PORT: String(port) },
  });
}

const prelude = (port) => `
const SITE_CONFIG = {
  domain: 'localhost:${port}', notionDomain: 'space.notion.site', siteName: 'S',
  slugToPage: { '/': '${'1'.repeat(32)}' },
  customHeadCSS: '', customHeadJS: '', customBodyJS: '', customHeader: '',
};
globalThis.__seen = null;
globalThis.fetch = async (input, init) => {
  const r = input instanceof Request ? input : new Request(input, init);
  globalThis.__seen = { method: r.method, body: r.body ? await r.text() : '' };
  const h = new Headers({ 'content-type': 'text/html' });
  h.append('set-cookie', 'token_v2=abc; Domain=notion.site; Path=/');
  h.append('set-cookie', 'user_id=42; Domain=notion.site; Path=/');
  return new Response('<html><head></head><body>x</body></html>', { headers: h });
};
`;

// Drives the server the snippet started. Uses node:http rather than fetch,
// because the snippet's own upstream stub replaces the global fetch.
const DRIVER = (port) => `
const nodeHttp = await import('node:http');
const reply = await new Promise((resolve, reject) => {
  const rq = nodeHttp.request(
    { host: '127.0.0.1', port: ${port}, path: '/api/v3/loadPageChunk', method: 'POST',
      headers: { 'content-type': 'application/json' } },
    (rs) => { rs.resume(); rs.on('end', () => resolve(rs.rawHeaders)); },
  );
  rq.on('error', reject);
  rq.end(JSON.stringify({ pageId: 'x' }));
});
const cookies = reply.filter((_, i) => i % 2 === 0)
  .map((k, i) => [k.toLowerCase(), reply[i * 2 + 1]])
  .filter(([k]) => k === 'set-cookie')
  .map(([, v]) => v);
console.log(JSON.stringify({ forwarded: globalThis.__seen, cookies }));
process.exit(0);
`;

test('the README Node.js example works as published', { skip }, async (t) => {
  const snippet = snippetAfter('**Node.js (22+):**');
  const port = await freePort();
  const result = JSON.parse(runSnippet(snippet, DRIVER, port).trim().split('\n').pop());

  await t.test('it forwards the request body to Notion', () => {
    // Without this, every page loads as an empty shell.
    assert.equal(result.forwarded?.body, '{"pageId":"x"}', 'the POST body was dropped');
  });

  await t.test('it preserves the request method', () => {
    assert.equal(result.forwarded?.method, 'POST');
  });

  await t.test('it writes each Set-Cookie as its own header', () => {
    // Collapsed into one, a signed-in reader loses the token_v2 cookie.
    assert.equal(result.cookies.length, 2, `cookies were merged: ${JSON.stringify(result.cookies)}`);
    assert.ok(
      result.cookies.some((c) => c.startsWith('token_v2=')),
      `the login cookie was lost: ${JSON.stringify(result.cookies)}`,
    );
  });

  await t.test('it re-scopes cookies to the serving host', () => {
    assert.ok(
      result.cookies.every((c) => !c.includes('notion.site')),
      `a Notion domain survived: ${JSON.stringify(result.cookies)}`,
    );
  });
});

test('the README Cloudflare example matches the shipped example project', { skip }, async (t) => {
  const snippet = snippetAfter('**Cloudflare Workers:**');

  await t.test('it passes the Request straight through', () => {
    // Workers hands over a real Request, so there is nothing to rebuild — and
    // rebuilding it is exactly what broke the Node example.
    assert.match(snippet, /proxy\(request\)/);
    assert.ok(!snippet.includes('new Request('), 'the Workers example should not reconstruct the Request');
  });

  await t.test('the example project in examples/cloudflare agrees with it', () => {
    const example = fs.readFileSync(path.join(ROOT, 'examples/cloudflare/src/index.ts'), 'utf8');
    for (const fragment of ['initializeNooxy', 'SITE_CONFIG', 'proxy(request)']) {
      assert.ok(example.includes(fragment), `examples/cloudflare no longer contains ${fragment}`);
    }
  });
});

test.after(() => {
  for (const dir of temporary) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
