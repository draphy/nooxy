// src/handlers/* — the responses nooxy builds itself rather than proxying.
//
// Whether a path reaches a handler at all is proxy-routing's concern. This file
// owns what the handlers produce, and in particular the favicon handler, which
// is the only one that fetches a URL taken from the site config.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, quietly, respondWith, skip } from './helpers/harness.mjs';

const ICON = 'https://cdn.example/icon.ico';
const withIcon = (overrides) => baseConfig({ siteIcon: ICON, ...overrides });

test('favicon: serving the configured icon', { skip }, async (t) => {
  await t.test('is fetched from siteIcon and returned', async () => {
    const proxy = createProxy(withIcon(), respondWith.binary('ICONBYTES', 'image/x-icon'));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(proxy.upstream[0].url, ICON);
    assert.equal(await response.text(), 'ICONBYTES');
    assert.equal(response.status, 200);
  });

  await t.test('caching headers from the icon host are kept', async () => {
    const proxy = createProxy(
      withIcon(),
      respondWith.binary('ICON', 'image/png', { 'cache-control': 'max-age=3600', etag: 'W/"i"' }),
    );
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'max-age=3600');
    assert.equal(response.headers.get('etag'), 'W/"i"');
  });

  await t.test('a missing content type falls back to an icon type', async () => {
    // A binary body is used deliberately: the Response constructor invents
    // "text/plain" for a string one, so the header would never be absent.
    const bytes = new Uint8Array([0, 0, 1, 0]);
    const proxy = createProxy(withIcon(), () => new Response(bytes, { status: 200 }));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.match(response.headers.get('content-type') ?? '', /icon/);
  });

  await t.test('a nested favicon path is served too', async () => {
    const proxy = createProxy(withIcon(), respondWith.binary('ICON', 'image/x-icon'));
    await proxy.fetch('https://example.com/sub/favicon.ico');
    assert.equal(proxy.upstream[0].url, ICON);
  });
});

test('favicon: the icon host cannot influence the site', { skip }, async (t) => {
  await t.test('Set-Cookie from the icon host is not replayed on the site domain', async () => {
    const proxy = createProxy(
      withIcon(),
      respondWith.binary('ICON', 'image/x-icon', { 'set-cookie': 'track=1; Path=/' }),
    );
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(response.headers.get('set-cookie'), null, 'a third-party cookie was set on this domain');
  });

  await t.test('unrelated headers are dropped rather than forwarded', async () => {
    const proxy = createProxy(
      withIcon(),
      respondWith.binary('ICON', 'image/x-icon', { 'x-powered-by': 'something', 'x-frame-options': 'DENY' }),
    );
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-frame-options'), null);
  });

  await t.test('a non-http scheme is refused', async () => {
    for (const siteIcon of ['file:///etc/passwd', 'data:image/png;base64,AAA', 'ftp://host/i.ico']) {
      const proxy = createProxy(withIcon({ siteIcon }));
      await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
      const fetched = proxy.upstream[0]?.url ?? '';
      assert.ok(!fetched.startsWith(siteIcon.slice(0, 6)), `${siteIcon} was fetched`);
    }
  });
});

test('favicon: failures fall back instead of breaking the request', { skip }, async (t) => {
  await t.test('an unreachable icon host falls through to the proxy', async () => {
    const proxy = createProxy(withIcon(), respondWith.failure('cdn down'));
    const response = await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.notEqual(response.status, 500, 'a failing icon host broke the request');
  });

  await t.test('a non-ok icon response falls through to the proxy', async () => {
    let call = 0;
    const proxy = createProxy(withIcon(), () => {
      call += 1;
      return call === 1
        ? new Response('missing', { status: 404 })
        : new Response('NOTION-ICON', { status: 200, headers: { 'content-type': 'image/x-icon' } });
    });
    const response = await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'NOTION-ICON', 'did not fall back to the proxied favicon');
  });

  await t.test('an unparseable siteIcon falls through', async () => {
    const proxy = createProxy(withIcon({ siteIcon: 'not a url' }));
    const response = await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.notEqual(response.status, 500);
  });

  await t.test('a path that merely ends in favicon.ico is not intercepted', async () => {
    const proxy = createProxy(withIcon());
    await quietly(() => proxy.fetch('https://example.com/not-a-favicon.ico'));
    assert.notEqual(proxy.upstream[0]?.url, ICON, 'the icon handler claimed an unrelated path');
  });
});

test('OPTIONS handler', { skip }, async (t) => {
  await t.test('a plain request advertises the allowed methods', async () => {
    const proxy = createProxy(baseConfig());
    const response = await proxy.fetch('https://example.com/', { method: 'OPTIONS' });
    assert.equal(response.headers.get('allow'), 'GET, HEAD, POST, PUT, OPTIONS');
    assert.equal(response.headers.get('access-control-allow-origin'), null, 'CORS headers on a non-preflight');
  });

  await t.test('a full preflight gets the CORS headers', async () => {
    const proxy = createProxy(baseConfig());
    const response = await proxy.fetch('https://example.com/', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://other.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  });

  await t.test('a partial preflight is treated as a plain OPTIONS', async () => {
    const proxy = createProxy(baseConfig());
    const response = await proxy.fetch('https://example.com/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://other.example' },
    });
    assert.equal(response.headers.get('allow'), 'GET, HEAD, POST, PUT, OPTIONS');
  });
});

// siteIcon is a URL from the site config that the worker fetches server-side, so
// it is an outbound request an operator's config gets to choose. Loopback and
// link-local are refused: 169.254.169.254 is the cloud metadata service, which on
// a self-hosted Node deployment would return IAM credentials as the favicon, and
// loopback reaches admin interfaces bound to localhost. Neither is a plausible
// place to keep an icon.
//
// Private LAN ranges are deliberately allowed — serving assets from a sibling
// container is a legitimate self-hosting setup.
test('favicon: the icon URL cannot reach loopback or link-local hosts', { skip }, async (t) => {
  const REFUSED = [
    ['localhost by name', 'http://localhost/icon.ico'],
    ['a localhost subdomain', 'http://admin.localhost/icon.ico'],
    ['IPv4 loopback', 'http://127.0.0.1/icon.ico'],
    ['anywhere in 127/8', 'http://127.9.9.9/icon.ico'],
    ['IPv6 loopback', 'http://[::1]/icon.ico'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['link-local IPv6', 'http://[fe80::1]/icon.ico'],
    // URL normalizes an IPv4-mapped address to hex — '::ffff:127.0.0.1' becomes
    // '::ffff:7f00:1' — so a check written against the readable spelling was
    // comparing against a string that can never arrive. These two reach loopback
    // and the metadata service over a v6 socket on any dual-stack host.
    ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/icon.ico'],
    ['IPv4-mapped IPv6 loopback in hex', 'http://[::ffff:7f00:1]/icon.ico'],
    ['the metadata address, IPv4-mapped', 'http://[::ffff:169.254.169.254]/latest/meta-data/'],
    ['anywhere in mapped 127/8', 'http://[::ffff:127.9.9.9]/icon.ico'],
    ['the unspecified address', 'http://0.0.0.0/icon.ico'],
  ];

  for (const [description, siteIcon] of REFUSED) {
    await t.test(`${description} falls through to Notion`, async () => {
      const proxy = createProxy(baseConfig({ siteIcon }), respondWith.binary('NOTION-ICON', 'image/x-icon'));
      await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
      assert.equal(proxy.upstream.length, 1, 'expected exactly one upstream request');
      assert.ok(
        proxy.upstream[0].url.startsWith('https://space.notion.site/'),
        `the worker fetched the blocked host: ${proxy.upstream[0].url}`,
      );
    });
  }

  await t.test('a private LAN address is still allowed', async () => {
    // A sibling container serving assets is a normal self-hosting arrangement.
    const proxy = createProxy(
      baseConfig({ siteIcon: 'http://10.1.2.3/icon.ico' }),
      respondWith.binary('LANICON', 'image/x-icon'),
    );
    await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(proxy.upstream[0].url, 'http://10.1.2.3/icon.ico');
  });
});

test('favicon: a redirect cannot smuggle the request to a blocked host', { skip }, async (t) => {
  // Redirects used to be followed by fetch and only the *final* URL re-checked,
  // so a chain through loopback or the metadata address was still contacted —
  // its response was discarded, but the request happened. Each hop is now
  // validated before it is requested.
  const chain = (locations) => {
    let hop = 0;
    return () => {
      const location = locations[hop++];
      return location
        ? new Response(null, { status: 302, headers: { location } })
        : new Response('ICON', { headers: { 'content-type': 'image/x-icon' } });
    };
  };

  const BLOCKED = [
    ['loopback', 'http://127.0.0.1/icon.ico'],
    ['the metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/icon.ico'],
    ['a non-http scheme', 'file:///etc/passwd'],
  ];

  for (const [description, target] of BLOCKED) {
    await t.test(`a redirect to ${description} is refused`, async () => {
      const proxy = createProxy(baseConfig({ siteIcon: 'https://cdn.example/icon.ico' }), chain([target]));
      await quietly(() => proxy.fetch('https://example.com/favicon.ico'));

      const reached = proxy.upstream.map((request) => request.url);
      assert.ok(
        !reached.some((url) => url.startsWith(target.split('/').slice(0, 3).join('/'))),
        `the worker contacted the blocked hop: ${reached.join(', ')}`,
      );
      assert.ok(
        reached.at(-1)?.startsWith('https://space.notion.site/'),
        'expected a fall-through to the Notion favicon',
      );
    });
  }

  await t.test('a redirect loop gives up instead of spinning', async () => {
    const proxy = createProxy(
      baseConfig({ siteIcon: 'https://cdn.example/a.ico' }),
      () => new Response(null, { status: 302, headers: { location: 'https://cdn.example/a.ico' } }),
    );
    await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    // Exactly MAX_REDIRECTS + 1 attempts at the icon host, then one fall-through
    // to Notion. Asserted exactly rather than as "< 10": a regression that raised
    // the limit to 8 would have passed that, which is the thing worth catching.
    assert.equal(proxy.upstream.length, 5, `expected 4 icon hops + 1 fallback, got ${proxy.upstream.length}`);
    assert.ok(proxy.upstream.at(-1)?.url.startsWith('https://space.notion.site/'));
  });

  await t.test('a redirect to an allowed host is still followed', async () => {
    const proxy = createProxy(
      baseConfig({ siteIcon: 'https://cdn.example/old.ico' }),
      chain(['https://cdn.example/new.ico']),
    );
    const response = await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.equal(response.status, 200, 'a legitimate redirect was refused');
    assert.ok(
      proxy.upstream.some((request) => request.url === 'https://cdn.example/new.ico'),
      'the redirect target was never fetched',
    );
  });
});

test('favicon: an oversized icon is refused', { skip }, async (t) => {
  const LIMIT = 512 * 1024;

  await t.test('a declared content-length over the limit is rejected before buffering', async () => {
    const proxy = createProxy(
      withIcon(),
      respondWith.binary('small', 'image/x-icon', { 'content-length': String(LIMIT + 1) }),
    );
    await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    // The icon was fetched, then discarded; the Notion favicon is served instead.
    assert.equal(proxy.upstream.length, 2, 'expected a fall-through request to Notion');
    assert.ok(proxy.upstream[1].url.startsWith('https://space.notion.site/'));
  });

  await t.test('a body over the limit is rejected even when content-length lies', async () => {
    const proxy = createProxy(
      withIcon(),
      respondWith.binary(new Uint8Array(LIMIT + 10), 'image/x-icon', { 'content-length': '10' }),
    );
    await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.ok(proxy.upstream[1]?.url.startsWith('https://space.notion.site/'), 'oversized body was served');
  });

  await t.test('an oversized body with no content-length at all is rejected', async () => {
    // The declared-length check cannot help here, so this is the case that the
    // read itself has to bound. Buffering the whole body first and measuring
    // afterwards left the limit advisory: only the fetch timeout capped it.
    const proxy = createProxy(withIcon(), () => {
      const headers = new Headers({ 'content-type': 'image/x-icon' });
      return new Response(new Uint8Array(LIMIT + 4096), { headers });
    });
    await quietly(() => proxy.fetch('https://example.com/favicon.ico'));
    assert.ok(
      proxy.upstream[1]?.url.startsWith('https://space.notion.site/'),
      'an unbounded icon body was accepted and served',
    );
  });

  await t.test('an icon at the limit is still served', async () => {
    const proxy = createProxy(withIcon(), respondWith.binary(new Uint8Array(LIMIT), 'image/x-icon'));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal((await response.arrayBuffer()).byteLength, LIMIT);
  });
});

test('favicon: caching', { skip }, async (t) => {
  await t.test('a default cache-control is supplied when the host sends none', async () => {
    // Browsers request /favicon.ico often; without a hint the icon host would be
    // re-fetched on every cache miss.
    const proxy = createProxy(withIcon(), respondWith.binary('ICON', 'image/x-icon'));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.match(response.headers.get('cache-control') ?? '', /max-age=\d+/);
  });

  await t.test("the host's own cache-control wins", async () => {
    const proxy = createProxy(withIcon(), respondWith.binary('ICON', 'image/x-icon', { 'cache-control': 'no-store' }));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
