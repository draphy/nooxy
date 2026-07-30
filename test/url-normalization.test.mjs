// The URL primitives in src/helpers/index.ts: how the configured notionDomain
// is normalized into a fetch origin, and how the request's own host and port are
// read back for the URLs nooxy generates.
//
// Path-to-page resolution lives in url-mapping; what the proxy answers itself
// lives in proxy-routing. This file owns only the normalization step.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, get, PAGE, quietly, skip } from './helpers/harness.mjs';

const upstreamOriginFor = async (notionDomain) => {
  const proxy = createProxy(baseConfig({ notionDomain }));
  await quietly(() => proxy.fetch('https://example.com/about'));
  const url = proxy.upstream[0]?.url;
  return url ? new URL(url).origin : undefined;
};

test('notionDomain is normalized into an https origin', { skip }, async (t) => {
  const ACCEPTED = [
    ['a bare host', 'space.notion.site'],
    ['an https url', 'https://space.notion.site'],
    ['an http url, upgraded', 'http://space.notion.site'],
    ['an uppercase scheme', 'HTTP://space.notion.site'],
    ['a mixed-case scheme', 'HtTpS://space.notion.site'],
    ['surrounding whitespace', '  space.notion.site  '],
    ['a trailing slash', 'https://space.notion.site/'],
    ['a path that is discarded', 'https://space.notion.site/ignored'],
  ];

  for (const [description, configured] of ACCEPTED) {
    await t.test(description, async () => {
      assert.equal(await upstreamOriginFor(configured), 'https://space.notion.site');
    });
  }

  await t.test('a host with a port keeps it', async () => {
    assert.equal(await upstreamOriginFor('space.notion.site:8443'), 'https://space.notion.site:8443');
  });
});

test('an unusable notionDomain fails cleanly', { skip }, async (t) => {
  // An unhandled TypeError here reaches the visitor as a stack trace.
  for (const [description, configured] of [
    ['empty', ''],
    ['whitespace only', '   '],
    ['a bare scheme', 'https://'],
    ['a space in the host', 'not a host'],
  ]) {
    await t.test(`${description} returns a server error instead of throwing`, async () => {
      const proxy = createProxy(baseConfig({ notionDomain: configured }));
      const response = await quietly(() => proxy.fetch('https://example.com/about'));
      assert.equal(response.status, 500);
      assert.equal(proxy.upstream.length, 0, 'a misconfigured domain still reached the network');
      assert.ok(!(await response.text()).includes('TypeError'), 'internal error detail leaked');
    });
  }
});

test('the request host is read back for generated URLs', { skip }, async (t) => {
  const sitemapFor = async (requestUrl) => (await get(requestUrl)).response.text();

  await t.test('a production host is used as configured', async () => {
    assert.equal(await sitemapFor('https://example.com/robots.txt'), 'Sitemap: https://example.com/sitemap.xml');
  });

  await t.test('localhost with a port keeps the port', async () => {
    assert.equal(await sitemapFor('http://localhost:8787/robots.txt'), 'Sitemap: http://localhost:8787/sitemap.xml');
  });

  await t.test('localhost without a port does not gain a stray colon', async () => {
    // Building host:port by hand produced "http://localhost:/sitemap.xml".
    const sitemap = await sitemapFor('http://localhost/robots.txt');
    assert.ok(!sitemap.includes('localhost:'), `malformed authority: ${sitemap}`);
    assert.equal(sitemap, 'Sitemap: http://localhost/sitemap.xml');
  });

  await t.test('127.0.0.1 is treated as local too', async () => {
    assert.equal(await sitemapFor('http://127.0.0.1:3000/robots.txt'), 'Sitemap: http://127.0.0.1:3000/sitemap.xml');
  });

  await t.test('IPv6 loopback is treated as local too', async () => {
    // URL.hostname keeps the brackets on an IPv6 literal, so a check against the
    // bare '::1' never matched and [::1] fell through to the configured domain.
    assert.equal(await sitemapFor('http://[::1]:8787/robots.txt'), 'Sitemap: http://[::1]:8787/sitemap.xml');
  });

  await t.test('a host that merely contains "localhost" is not treated as local', async () => {
    // notlocalhost.com must keep the configured domain, not adopt the request's.
    const proxy = createProxy(baseConfig());
    const response = await proxy.fetch('https://notlocalhost.com/robots.txt');
    assert.equal(await response.text(), 'Sitemap: https://example.com/sitemap.xml');
  });

  await t.test('the request protocol is carried through', async () => {
    assert.match(await sitemapFor('http://example.com/robots.txt'), /^Sitemap: http:\/\//);
  });
});

test('local development still resolves pages normally', { skip }, async (t) => {
  await t.test('a slug resolves the same way on localhost', async () => {
    const proxy = createProxy(baseConfig());
    await proxy.fetch('http://localhost:8787/about');
    assert.equal(proxy.upstream[0]?.url, `https://space.notion.site/${PAGE.about}`);
  });
});
