// Slug to page-id resolution: the mapping that turns a pretty URL into the
// Notion page the proxy actually fetches.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, get, PAGE, quietly, skip, upstreamFor } from './helpers/harness.mjs';

test('configured slugs resolve to their page', { skip }, async (t) => {
  const CASES = [
    ['root', '/', PAGE.home],
    ['single segment', '/about', PAGE.about],
    ['nested segments', '/docs/getting-started', PAGE.nested],
  ];

  for (const [description, requestPath, pageId] of CASES) {
    await t.test(description, async () => {
      assert.equal(await upstreamFor(requestPath), `https://space.notion.site/${pageId}`);
    });
  }
});

test('query strings survive the mapping', { skip }, async (t) => {
  await t.test('a query on the root slug', async () => {
    assert.equal(await upstreamFor('/?v=1'), `https://space.notion.site/${PAGE.home}?v=1`);
  });

  await t.test('a query on a nested slug', async () => {
    assert.equal(
      await upstreamFor('/docs/getting-started?a=1&b=2'),
      `https://space.notion.site/${PAGE.nested}?a=1&b=2`,
    );
  });

  await t.test('an empty query is not invented', async () => {
    assert.equal(await upstreamFor('/about'), `https://space.notion.site/${PAGE.about}`);
  });
});

test('paths that are not slugs are passed through', { skip }, async (t) => {
  const PASSTHROUGH = ['/_assets/app-abc.js', '/api/v3/getPublicPageData', '/image/x.png', '/f/refresh'];

  for (const requestPath of PASSTHROUGH) {
    await t.test(requestPath, async () => {
      assert.equal(await upstreamFor(requestPath), `https://space.notion.site${requestPath}`);
    });
  }

  // A bare page id is also forwarded, but that is a property of the 404 gate,
  // so it is asserted in proxy-routing.
});

test('slug matching is exact', { skip }, async (t) => {
  await t.test('a longer path that merely starts with a slug is not remapped', async () => {
    // '/about-us' must not be treated as '/about'
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/about': PAGE.about } });
    const { response, upstream } = await quietly(() => get('/about-us', { config }));
    assert.equal(response.status, 404);
    assert.equal(upstream.length, 0);
  });

  await t.test('a slug containing regex metacharacters is matched literally', async () => {
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/v1.0': PAGE.about } });
    assert.equal(await upstreamFor('/v1.0', config), `https://space.notion.site/${PAGE.about}`);
  });

  await t.test('a slug with a quantifier character does not crash the regex', async () => {
    // '/c++' builds an invalid pattern unless escaped: "Nothing to repeat".
    // '/v1.0' compiles either way, so only this shape proves the escaping.
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/c++': PAGE.about } });
    assert.equal(await upstreamFor('/c++', config), `https://space.notion.site/${PAGE.about}`);
  });

  await t.test('a metacharacter slug does not match a wildcard-ish path', async () => {
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/v1.0': PAGE.about } });
    const { response } = await quietly(() => get('/v1X0', { config }));
    assert.equal(response.status, 404, "'.' in a slug behaved as a regex wildcard");
  });
});

test('the 404 slug participates in mapping', { skip }, async (t) => {
  const config = baseConfig({ fof: { page: PAGE.missing, slug: '/404' } });

  await t.test('the configured 404 slug resolves to its page', async () => {
    assert.equal(await upstreamFor('/404', config), `https://space.notion.site/${PAGE.missing}`);
  });

  await t.test('a custom 404 slug is honoured', async () => {
    const custom = baseConfig({ fof: { page: PAGE.missing, slug: '/not-found' } });
    assert.equal(await upstreamFor('/not-found', custom), `https://space.notion.site/${PAGE.missing}`);
  });
});

test('local development', { skip }, async (t) => {
  await t.test('localhost requests are proxied normally', async () => {
    const { upstreamUrl } = await quietly(() => get('http://localhost:8787/about'));
    assert.equal(upstreamUrl, `https://space.notion.site/${PAGE.about}`);
  });

  // The domain override that localhost triggers is observable in robots.txt,
  // which proxy-routing owns.
});

// A page id reaches resolveProxyPath as the replacement for the matched slug.
// Passed as a replacement *string*, a `$` pattern in it would expand against the
// match and splice part of the URL into the path. normalizePageId leaves anything
// that is not valid 32-char hex untouched, so a mistyped config value gets here
// intact — this is the last place in src/ that inserted data this way.
test('a page id containing $ substitution patterns', { skip }, async (t) => {
  const CASES = [
    ['$& (the whole match)', 'aaa$&bbb'],
    ['$` (everything before)', 'aaa$`bbb'],
    ["$' (everything after)", "aaa$'bbb"],
    ['$1 (a capture group)', 'aaa$1bbb'],
    ['a bare $', 'aaa$bbb'],
  ];

  for (const [description, pageId] of CASES) {
    await t.test(`${description} is used literally`, async () => {
      const config = baseConfig({ slugToPage: { '/': PAGE.home, '/odd': pageId } });
      const upstreamUrl = await upstreamFor('/odd', config);
      // Compared after decoding: new URL() percent-encodes characters such as a
      // backtick, which is normalization rather than substitution.
      const pathname = decodeURIComponent(new URL(upstreamUrl).pathname);
      assert.equal(pathname, `/${pageId}`, 'the pattern expanded instead of being inserted literally');
      assert.ok(!pathname.includes('/odd'), `part of the URL was spliced into the path: ${pathname}`);
    });
  }
});
