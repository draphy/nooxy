// Shared setup for the proxy test files.
//
// Every test drives the real public entry point, initializeNooxy, against the
// built bundle, with global fetch stubbed so the upstream request can be
// inspected and the upstream response controlled. Nothing reaches the network.
//
// This is not a *.test.mjs file, so the runner does not pick it up directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist/index.js');

/**
 * The bundle these tests run against is a build artefact, so it can silently
 * lag behind src and let a broken change look green. Compare timestamps and
 * refuse to run rather than report a false pass.
 */
function newestSourceTime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSourceTime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

export const built = fs.existsSync(DIST);

const staleReason = !built
  ? 'run `pnpm build` first'
  : newestSourceTime(path.join(ROOT, 'src')) > fs.statSync(DIST).mtimeMs
    ? 'dist is older than src — run `pnpm build` (these tests exercise the built bundle)'
    : false;

// Skipping is the helpful answer for someone who forgot to build; in CI it is
// the dangerous one, because a skipped suite still reports green. A pipeline
// that quietly stopped running these tests would look exactly like a passing
// one, so there the missing build is a hard failure instead.
if (staleReason && process.env.CI) {
  throw new Error(`Refusing to report a pass without a current build: ${staleReason}`);
}

export const skip = staleReason;

const { initializeNooxy } = built ? await import(DIST) : {};

/** Re-exported so tests can exercise the entry point's own call shapes. */
export { initializeNooxy };

export const PAGE = {
  home: '11111111111111111111111111111111',
  about: '22222222222222222222222222222222',
  nested: '33333333333333333333333333333333',
  missing: '99999999999999999999999999999999',
};

export const NOTION_HTML = [
  '<!DOCTYPE html><html><head>',
  '<title>Notion</title>',
  '<meta name="description" content="a Notion page"/>',
  '<meta name="robots" content="noindex,nofollow"/>',
  '<meta property="og:site_name" content="Notion"/>',
  '<meta property="og:url" content="https://space.notion.site/x"/>',
  '<meta name="twitter:site" content="@notion"/>',
  '<meta name="twitter:url" content="https://space.notion.site/x"/>',
  '<meta name="apple-itunes-app" content="app-id=123"/>',
  '<link rel="canonical" href="https://space.notion.site/x"/>',
  '<script src="/_assets/app-abc.js" async></script>',
  '</head><body>hello</body></html>',
].join('');

/** A config with only the required fields filled in. */
export function baseConfig(overrides = {}) {
  return {
    domain: 'example.com',
    notionDomain: 'space.notion.site',
    siteName: 'Test Site',
    slugToPage: {
      '/': PAGE.home,
      '/about': PAGE.about,
      '/docs/getting-started': PAGE.nested,
    },
    customHeadCSS: '',
    customHeadJS: '',
    customBodyJS: '',
    customHeader: '',
    ...overrides,
  };
}

let sequence = 0;

/**
 * Builds a handler whose upstream is stubbed.
 *
 * @param {object} config - site config passed to initializeNooxy
 * @param {(request: Request) => Response} [respond] - upstream response factory
 * @returns {{upstream: Request[], fetch: (url: string, init?: RequestInit) => Promise<Response>}}
 */
export function createProxy(config, respond) {
  const upstream = [];
  const reply = respond ?? (() => new Response(NOTION_HTML, { status: 200, headers: { 'content-type': 'text/html' } }));
  // ConfigManager caches by key, so every harness needs its own.
  const handler = initializeNooxy({ configKey: `harness-${sequence++}`, config });

  return {
    upstream,
    async fetch(url, init) {
      const realFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        // handleFavicon calls fetch with a bare URL string, everything else
        // passes a Request. Normalize so tests can always read `.url`.
        const request = input instanceof Request ? input : new Request(input, init);
        upstream.push(request);
        return reply(request);
      };
      try {
        return await handler(new Request(url, init));
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  };
}

/** Convenience: one request against a default-configured proxy. */
export async function get(pathOrUrl, { config, respond, init } = {}) {
  const proxy = createProxy(config ?? baseConfig(), respond);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://example.com${pathOrUrl}`;
  const response = await proxy.fetch(url, init);
  return { response, upstream: proxy.upstream, upstreamUrl: proxy.upstream[0]?.url };
}

/** The URL the proxy asked the upstream for. */
export async function upstreamFor(pathOrUrl, config) {
  const { upstreamUrl } = await quietly(() => get(pathOrUrl, config ? { config } : undefined));
  return upstreamUrl;
}

/** The rewritten body the visitor receives. */
export async function htmlFor(pathOrUrl, config) {
  const { response } = await get(pathOrUrl, config ? { config } : undefined);
  return response.text();
}

// Upstream response factories. Content type decides whether the proxy rewrites
// a body at all, so it is always explicit.
export const respondWith = {
  html:
    (body = '<html><head></head><body>x</body></html>', headers = {}) =>
    () =>
      new Response(body, { headers: { 'content-type': 'text/html', ...headers } }),

  /** Several Set-Cookie headers, which a plain object literal cannot express. */
  htmlWithCookies: (cookies) => () => {
    const headers = new Headers({ 'content-type': 'text/html' });
    for (const cookie of cookies) {
      headers.append('set-cookie', cookie);
    }
    return new Response('<html><head></head><body>x</body></html>', { headers });
  },

  javascript: (body) => () => new Response(body, { headers: { 'content-type': 'application/javascript' } }),

  binary:
    (body, contentType = 'image/png', headers = {}) =>
    () =>
      new Response(body, { headers: { 'content-type': contentType, ...headers } }),

  status:
    (status, body = '<html><head></head><body>x</body></html>') =>
    () =>
      new Response(body, { status, headers: { 'content-type': 'text/html' } }),

  notModified:
    (headers = {}) =>
    () =>
      new Response(null, { status: 304, headers }),

  failure:
    (message = 'upstream exploded') =>
    () => {
      throw new Error(message);
    },
};

/** Silences the proxy's expected console noise for a single call. */
export async function quietly(run) {
  const realError = console.error;
  const realWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
}
