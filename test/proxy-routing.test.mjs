// Request routing: everything the proxy answers itself, before any upstream
// fetch, plus the not-found path.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, get, PAGE, quietly, respondWith, skip } from './helpers/harness.mjs';

test('robots.txt', { skip }, async (t) => {
  await t.test('points crawlers at the sitemap on the configured domain', async () => {
    const { response, upstream } = await get('/robots.txt');
    assert.equal(upstream.length, 0, 'robots.txt should not be proxied');
    assert.equal(await response.text(), 'Sitemap: https://example.com/sitemap.xml');
  });

  await t.test('keeps the request protocol', async () => {
    const { response } = await get('http://example.com/robots.txt');
    assert.match(await response.text(), /^Sitemap: http:\/\//);
  });

  await t.test('reports the localhost origin, port included, during local development', async () => {
    const { response } = await get('http://localhost:8787/robots.txt');
    assert.equal(await response.text(), 'Sitemap: http://localhost:8787/sitemap.xml');
  });
});

test('sitemap.xml', { skip }, async (t) => {
  await t.test('lists every configured slug', async () => {
    const { response, upstream } = await get('/sitemap.xml');
    assert.equal(upstream.length, 0);
    const xml = await response.text();
    assert.match(response.headers.get('content-type') ?? '', /xml/);
    for (const slug of ['/', '/about', '/docs/getting-started']) {
      assert.ok(xml.includes(`<loc>https://example.com${slug}</loc>`), `missing ${slug}`);
    }
  });

  await t.test('uses the canonical domain and path map when configured', async () => {
    const config = baseConfig({
      seo: { canonicalDomain: 'canonical.example', canonicalPathMap: { '/': '/home' } },
    });
    const { response } = await get('/sitemap.xml', { config });
    const xml = await response.text();
    assert.ok(xml.includes('<loc>https://canonical.example/home</loc>'));
    assert.ok(!xml.includes('https://example.com/'), 'the raw domain leaked into the sitemap');
  });

  await t.test('includes the 404 page slug once it is configured', async () => {
    const config = baseConfig({ fof: { page: PAGE.missing, slug: '/404' } });
    const { response } = await get('/sitemap.xml', { config });
    assert.ok((await response.text()).includes('<loc>https://example.com/404</loc>'));
  });

  await t.test('escapes XML metacharacters in slugs', async () => {
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/a&b': PAGE.about } });
    const { response } = await get('/sitemap.xml', { config });
    const xml = await response.text();
    assert.ok(xml.includes('/a&amp;b'), 'ampersand was not escaped');
  });
});

test('favicon', { skip }, async (t) => {
  await t.test('is served from siteIcon when configured', async () => {
    const config = baseConfig({ siteIcon: 'https://cdn.example/icon.ico' });
    const proxy = createProxy(config, respondWith.binary('ICONBYTES', 'image/x-icon'));
    const response = await proxy.fetch('https://example.com/favicon.ico');
    assert.equal(proxy.upstream[0].url, 'https://cdn.example/icon.ico');
    assert.equal(await response.text(), 'ICONBYTES');
  });

  await t.test('falls through to the proxy when siteIcon is not set', async () => {
    const { upstreamUrl } = await quietly(() => get('/favicon.ico'));
    assert.ok(upstreamUrl?.startsWith('https://space.notion.site/'), 'favicon should be proxied');
  });
});

test('subdomain redirects', { skip }, async (t) => {
  const config = baseConfig({ subDomains: { www: { redirect: 'https://example.com' } } });

  await t.test('a configured subdomain is redirected permanently', async () => {
    const proxy = createProxy(config);
    const response = await proxy.fetch('https://www.example.com/about');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), 'https://example.com/');
    assert.equal(proxy.upstream.length, 0, 'a redirect should not hit the upstream');
  });

  await t.test('an unparseable redirect target fails cleanly instead of throwing', async () => {
    // Response.redirect throws a TypeError on anything it cannot parse, and this
    // value comes straight from the site config, so a typo used to surface to the
    // visitor as an unhandled crash.
    const broken = baseConfig({ subDomains: { www: { redirect: 'not a url' } } });
    const proxy = createProxy(broken);
    const response = await quietly(() => proxy.fetch('https://www.example.com/'));
    assert.equal(response.status, 500);
    assert.equal(proxy.upstream.length, 0);
  });

  await t.test('the apex domain is not redirected', async () => {
    const proxy = createProxy(config);
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.status, 200);
    assert.equal(proxy.upstream.length, 1);
  });

  await t.test('an unconfigured subdomain is not redirected', async () => {
    const proxy = createProxy(config);
    const response = await proxy.fetch('https://blog.example.com/about');
    assert.equal(response.status, 200);
  });
});

test('pseudo endpoints', { skip }, async (t) => {
  const CASES = [
    ['/200/www.notion.so/api/v3/x', 'success'],
    ['/200/exp.notion.so/v1/x', '{"success":true}'],
    ['/200/anything/else', ''],
  ];

  for (const [requestPath, expectedBody] of CASES) {
    await t.test(`${requestPath} is answered locally`, async () => {
      const { response, upstream } = await get(requestPath);
      assert.equal(response.status, 200);
      assert.equal(upstream.length, 0, 'a pseudo endpoint should never be proxied');
      assert.equal(await response.text(), expectedBody);
    });
  }

  // The prefix must end at a segment boundary. '/2000' is a slug someone could
  // reasonably configure, and it used to be swallowed and answered empty.
  for (const [description, requestPath] of [
    ['a longer numeric slug', '/2000'],
    ['a slug that merely starts with 200', '/200-years'],
  ]) {
    await t.test(`${description} (${requestPath}) is a real page, not a pseudo endpoint`, async () => {
      const config = baseConfig({ slugToPage: { '/': PAGE.home, [requestPath]: PAGE.about } });
      const { response, upstreamUrl } = await quietly(() => get(requestPath, { config }));
      assert.equal(response.status, 200);
      assert.equal(upstreamUrl, `https://space.notion.site/${PAGE.about}`, 'the slug was intercepted');
    });
  }
});

test('not found handling', { skip }, async (t) => {
  await t.test('an unmapped human path returns 404', async () => {
    const { response, upstream } = await quietly(() => get('/no-such-page'));
    assert.equal(response.status, 404);
    assert.equal(upstream.length, 0);
  });

  await t.test('an unmapped path redirects to the 404 page when one is configured', async () => {
    const config = baseConfig({ fof: { page: PAGE.missing, slug: '/404' } });
    const { response } = await quietly(() => get('/no-such-page', { config }));
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), 'https://example.com/404');
  });

  await t.test('an upstream failure is a 503, not a redirect to the 404 page', async () => {
    // A configured fof page used to swallow every upstream error: the visitor was
    // 302'd to /404, which tells them and every crawler the page does not exist
    // when in fact the upstream timed out. It also discarded the URL they asked
    // for, so a reload could not recover.
    const config = baseConfig({ fof: { page: PAGE.missing, slug: '/404' } });
    const { response } = await quietly(() => get('/', { config, respond: respondWith.failure('upstream timed out') }));
    assert.equal(response.status, 503, 'a transient upstream failure was reported as a 404');
    assert.equal(response.headers.get('location'), null, 'the requested URL was discarded');
    assert.equal(response.headers.get('retry-after'), '5');
  });

  await t.test('asset paths bypass the 404 check', async () => {
    for (const assetPath of ['/_assets/app.js', '/image/x', '/f/refresh', '/a/b.css']) {
      const { upstreamUrl } = await quietly(() => get(assetPath));
      assert.ok(upstreamUrl, `${assetPath} should be proxied, not 404'd`);
    }
  });

  await t.test('a bare 32-character page id is proxied', async () => {
    const { upstreamUrl } = await quietly(() => get(`/${PAGE.missing}`));
    assert.equal(upstreamUrl, `https://space.notion.site/${PAGE.missing}`);
  });
});

// Notion's client loads every page's content over POST /api/v3/..., so a
// dropped request body means the site renders a shell that never fills in.
// Nothing exercised a body before, which is how a crash on every POST shipped:
// building the upstream Request from a stream body without `duplex: 'half'`
// throws under Node, though not on Cloudflare Workers.
test('requests carrying a body', { skip }, async (t) => {
  const postTo = async (path, body) => {
    const proxy = createProxy(baseConfig(), respondWith.html());
    const response = await proxy.fetch(`https://example.com${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return { response, upstream: proxy.upstream };
  };

  await t.test('a POST body reaches Notion unchanged', async () => {
    const body = JSON.stringify({ pageId: 'x', limit: 30 });
    const { upstream } = await postTo('/api/v3/loadPageChunk', body);
    assert.equal(upstream.length, 1, 'the request never reached the upstream');
    assert.equal(await upstream[0].text(), body);
  });

  await t.test('the method is preserved', async () => {
    const { upstream } = await postTo('/api/v3/loadPageChunk', '{}');
    assert.equal(upstream[0].method, 'POST');
  });

  await t.test('a POST does not fail the request', async () => {
    const { response } = await postTo('/api/v3/loadPageChunk', '{}');
    assert.equal(response.status, 200);
  });

  await t.test('an empty POST body is still forwarded', async () => {
    const proxy = createProxy(baseConfig(), respondWith.html());
    const response = await proxy.fetch('https://example.com/api/v3/ping', { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(proxy.upstream[0].method, 'POST');
  });

  await t.test('a GET is unaffected', async () => {
    const proxy = createProxy(baseConfig(), respondWith.html());
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.status, 200);
    assert.equal(proxy.upstream[0].method, 'GET');
  });
});
