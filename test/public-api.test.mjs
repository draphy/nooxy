// The contract of initializeNooxy itself: how it is called, how instances are
// kept apart, and what must not persist between requests.
//
// The README advertises multi-tenant hosting and Node deployments, so these are
// package-level promises rather than internal details.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, initializeNooxy, PAGE, quietly, respondWith, skip } from './helpers/harness.mjs';

/** Drives a handler built by the test itself, rather than by the harness. */
async function fetchThrough(handler, url) {
  const upstream = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    upstream.push(request);
    return new Response('<html><head></head><body>x</body></html>', {
      headers: { 'content-type': 'text/html' },
    });
  };
  try {
    const response = await handler(new Request(url));
    return { response, upstreamUrl: upstream[0]?.url };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('both documented call shapes work', { skip }, async (t) => {
  await t.test('a bare config object', async () => {
    const handler = initializeNooxy(baseConfig({ slugToPage: { '/': PAGE.home, '/about': PAGE.about } }));
    const { upstreamUrl } = await fetchThrough(handler, 'https://example.com/about');
    assert.equal(upstreamUrl, `https://space.notion.site/${PAGE.about}`);
  });

  await t.test('a config wrapped with a configKey', async () => {
    const handler = initializeNooxy({ configKey: 'shape-test', config: baseConfig() });
    const { upstreamUrl } = await fetchThrough(handler, 'https://example.com/about');
    assert.equal(upstreamUrl, `https://space.notion.site/${PAGE.about}`);
  });

  await t.test('an explicitly empty configKey falls back to the default', async () => {
    const handler = initializeNooxy({ configKey: '', config: baseConfig() });
    const { upstreamUrl } = await fetchThrough(handler, 'https://example.com/about');
    assert.ok(upstreamUrl?.startsWith('https://space.notion.site/'));
  });
});

test('instances are kept apart', { skip }, async (t) => {
  // "Host multiple sites from one deployment" is a documented feature, and
  // ConfigManager caches per key, so two keys must not see each other's config.
  // configKey is not mentioned in either README, so this — two plain
  // initializeNooxy calls — is what following the docs produces. It used to make
  // both sites share one cached config: the second silently served the first
  // site's domain, sitemap and canonical URLs.
  await t.test('two sites stay separate without an explicit configKey', async () => {
    const siteA = initializeNooxy(
      baseConfig({ domain: 'a.example', notionDomain: 'a.notion.site', slugToPage: { '/': PAGE.home } }),
    );
    const siteB = initializeNooxy(
      baseConfig({ domain: 'b.example', notionDomain: 'b.notion.site', slugToPage: { '/': PAGE.about } }),
    );

    const a = await fetchThrough(siteA, 'https://a.example/');
    const b = await fetchThrough(siteB, 'https://b.example/');
    assert.equal(a.upstreamUrl, `https://a.notion.site/${PAGE.home}`);
    assert.equal(b.upstreamUrl, `https://b.notion.site/${PAGE.about}`, 'site B served site A config');
  });

  await t.test('each site reports its own domain without a configKey', async () => {
    const siteA = initializeNooxy(baseConfig({ domain: 'a2.example' }));
    const siteB = initializeNooxy(baseConfig({ domain: 'b2.example' }));

    const a = await fetchThrough(siteA, 'https://a2.example/robots.txt');
    const b = await fetchThrough(siteB, 'https://b2.example/robots.txt');
    assert.match(await a.response.text(), /a2\.example/);
    assert.match(await b.response.text(), /b2\.example/, 'site B advertised site A domain');
  });

  await t.test('reusing one configKey for two configs is reported', async () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      initializeNooxy({ configKey: 'shared', config: baseConfig({ domain: 'first.example' }) });
      initializeNooxy({ configKey: 'shared', config: baseConfig({ domain: 'second.example' }) });
    } finally {
      console.warn = realWarn;
    }
    assert.ok(
      warnings.some((line) => line.includes('configKey "shared"')),
      `a silently ignored config was not reported: ${warnings.join(' | ')}`,
    );
  });

  await t.test('two sites on one deployment resolve independently', async () => {
    const siteA = initializeNooxy({
      configKey: 'tenant-a',
      config: baseConfig({ domain: 'a.example', notionDomain: 'a.notion.site', slugToPage: { '/': PAGE.home } }),
    });
    const siteB = initializeNooxy({
      configKey: 'tenant-b',
      config: baseConfig({ domain: 'b.example', notionDomain: 'b.notion.site', slugToPage: { '/': PAGE.about } }),
    });

    const a = await fetchThrough(siteA, 'https://a.example/');
    const b = await fetchThrough(siteB, 'https://b.example/');
    assert.equal(a.upstreamUrl, `https://a.notion.site/${PAGE.home}`);
    assert.equal(b.upstreamUrl, `https://b.notion.site/${PAGE.about}`);
  });

  await t.test('each site reports its own domain', async () => {
    const siteA = initializeNooxy({ configKey: 'robots-a', config: baseConfig({ domain: 'a.example' }) });
    const siteB = initializeNooxy({ configKey: 'robots-b', config: baseConfig({ domain: 'b.example' }) });

    const a = await fetchThrough(siteA, 'https://a.example/robots.txt');
    const b = await fetchThrough(siteB, 'https://b.example/robots.txt');
    assert.match(await a.response.text(), /a\.example/);
    assert.match(await b.response.text(), /b\.example/);
  });
});

test('no request leaves state behind for the next one', { skip }, async (t) => {
  // The handler used to write the localhost domain back onto the cached config,
  // so a single local request left every later one advertising localhost in its
  // canonical URLs, sitemap and redirects.
  const LOCAL_HOSTS = ['http://localhost:8787', 'http://127.0.0.1:3000'];

  for (const localOrigin of LOCAL_HOSTS) {
    await t.test(`a request to ${localOrigin} does not change the configured domain`, async () => {
      const proxy = createProxy(baseConfig());

      const before = await (await proxy.fetch('https://example.com/robots.txt')).text();
      await proxy.fetch(`${localOrigin}/about`);
      const after = await (await proxy.fetch('https://example.com/robots.txt')).text();

      assert.equal(after, before, 'the cached domain was mutated by a local request');
      assert.equal(after, 'Sitemap: https://example.com/sitemap.xml');
    });
  }

  await t.test('a local request still reports its own origin', async () => {
    const proxy = createProxy(baseConfig());
    const response = await proxy.fetch('http://localhost:8787/robots.txt');
    assert.equal(await response.text(), 'Sitemap: http://localhost:8787/sitemap.xml');
  });

  await t.test('canonical URLs are not poisoned by an earlier local request', async () => {
    const proxy = createProxy(baseConfig());
    await proxy.fetch('http://localhost:8787/about');
    const html = await (await proxy.fetch('https://example.com/about')).text();
    assert.ok(!html.includes('localhost'), 'localhost leaked into the rewritten page');
    assert.match(html, /rel="canonical" href="https:\/\/example\.com\/about"/);
  });

  await t.test('a 404 redirect is not poisoned either', async () => {
    const config = baseConfig({ fof: { page: PAGE.missing, slug: '/404' } });
    const proxy = createProxy(config);
    await proxy.fetch('http://localhost:8787/about');
    const response = await quietly(() => proxy.fetch('https://example.com/nope'));
    assert.equal(response.headers.get('location'), 'https://example.com/404');
  });

  await t.test('an upstream failure does not disable the instance', async () => {
    let fail = true;
    const proxy = createProxy(baseConfig(), (request) => {
      if (fail) {
        throw new Error('transient');
      }
      return respondWith.html()(request);
    });

    const first = await quietly(() => proxy.fetch('https://example.com/about'));
    assert.equal(first.status, 503);

    fail = false;
    const second = await proxy.fetch('https://example.com/about');
    assert.equal(second.status, 200, 'the instance did not recover from a transient upstream failure');
  });
});
