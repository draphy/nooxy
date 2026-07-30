// Security boundaries of the proxy.
//
// Two classes of input are untrusted here:
//   - the request path, which any visitor controls
//   - the site config, which in a multi-tenant deployment is not necessarily
//     authored by whoever runs the worker
//
// Both end up in a fetch target or in markup, so both are pinned down here.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, get, PAGE, quietly, respondWith, skip } from './helpers/harness.mjs';

// A path is resolved against the Notion origin. A scheme-relative path such as
// "//evil.com/x" resolves to a different host, which would make the proxy fetch
// that host and serve its response from the site's own domain.
const ESCAPE_ATTEMPTS = [
  ['scheme-relative path', '//evil.com/a.js'],
  ['scheme-relative asset path', '//evil.com/_assets/a.js'],
  ['backslashes, which URL parsing normalizes to slashes', '/\\\\evil.com/a.js'],
  ['triple slash', '///evil.com/a.js'],
  ['credentials in the authority', '//user:pw@evil.com/a.js'],
  ['cloud metadata address', '//169.254.169.254/latest/meta-data/a.js'],
  ['localhost', '//127.0.0.1:8080/a.js'],
  ['scheme-relative with a query', '//evil.com/a.js?x=1'],
  ['uppercase host', '//EVIL.com/a.js'],
  ['trailing dot host', '//evil.com./a.js'],
];

// Hosts built to resemble the configured Notion domain (space.notion.site).
// An origin check written as a prefix, suffix or substring test lets these
// through while still blocking evil.com, so without them the guard could be
// weakened to a lookalike-accepting version and every test above would pass.
const LOOKALIKE_HOSTS = [
  ['the real domain as a subdomain of an attacker host', '//space.notion.site.evil.com/a.js'],
  ['an attacker host sharing the .site suffix', '//evil.site/a.js'],
  ['the parent domain rather than the configured subdomain', '//notion.site/a.js'],
  ['the same characters without the separating dot', '//spacenotion.site/a.js'],
  ['a prefixed hostname', '//xspace.notion.site/a.js'],
  ['a hyphen swapped for the dot', '//space-notion.site/a.js'],
  ['the real domain appearing only in the path', '//evil.com/space.notion.site/a.js'],
  ['the real domain appearing only in the query', '//evil.com/a.js?to=space.notion.site'],
];

test('the fetch target can never leave the Notion origin', { skip }, async (t) => {
  for (const [description, requestPath] of ESCAPE_ATTEMPTS) {
    await t.test(description, async () => {
      const { response, upstream } = await quietly(() => get(requestPath));
      assert.equal(response.status, 404, `${requestPath} should not be proxied`);
      assert.equal(upstream.length, 0, `${requestPath} reached the network`);
    });
  }

  for (const [description, requestPath] of LOOKALIKE_HOSTS) {
    await t.test(description, async () => {
      const { response, upstream } = await quietly(() => get(requestPath));
      assert.equal(response.status, 404, `${requestPath} should not be proxied`);
      assert.equal(upstream.length, 0, `${requestPath} reached the network`);
    });
  }

  // Control: the origin check must not reject legitimate traffic. Which page a
  // slug maps to is url-mapping's concern, so only the origin is asserted here.
  await t.test('ordinary paths are still proxied to the Notion origin', async () => {
    for (const requestPath of ['/', '/about', '/docs/getting-started', '/_assets/app.js']) {
      const { upstreamUrl } = await quietly(() => get(requestPath));
      assert.ok(upstreamUrl, `${requestPath} should be proxied`);
      assert.ok(upstreamUrl.startsWith('https://space.notion.site/'), `${requestPath} went to ${upstreamUrl}`);
    }
  });
});

// Config strings are interpolated into markup. If they are not neutralized, a
// tenant can inject script into a page served by the operator's worker.
test('config values cannot inject markup or script', { skip }, async (t) => {
  const BREAKOUT = '"><script>alert(1)</script>';

  await t.test('siteName is escaped in og:site_name', async () => {
    const { response } = await get('/', { config: baseConfig({ siteName: BREAKOUT }) });
    const html = await response.text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'siteName broke out of the attribute');
  });

  await t.test('twitterHandle is escaped', async () => {
    const { response } = await get('/', { config: baseConfig({ twitterHandle: BREAKOUT }) });
    const html = await response.text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'twitterHandle broke out of the attribute');
  });

  await t.test('brandReplacement is escaped', async () => {
    const config = baseConfig({ seo: { brandReplacement: BREAKOUT } });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'brandReplacement broke out');
  });

  await t.test('page metadata is escaped', async () => {
    const config = baseConfig({
      pageMetadata: { [PAGE.home]: { title: BREAKOUT, description: BREAKOUT, author: BREAKOUT } },
    });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'page metadata broke out');
  });

  await t.test('a </script> in a config value cannot escape the ld+json block', async () => {
    const config = baseConfig({ siteName: '</script><script>alert(1)</script>' });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.ok(!html.includes('</script><script>alert(1)'), 'siteName closed the ld+json script');
  });

  // Every case above is a config *value*. slugToPage and pageMetadata are keyed
  // by strings the operator also writes, and those keys are serialized straight
  // into a <script> element — which JSON.stringify does not make safe, because it
  // leaves '<' alone.
  for (const [description, config] of [
    [
      'a slugToPage key',
      baseConfig({
        slugToPage: { '/': PAGE.home, '/x</script><script>alert(1)</script>': PAGE.about },
      }),
    ],
    ['a pageMetadata key', baseConfig({ pageMetadata: { '</script><script>alert(1)</script>': { title: 'T' } } })],
  ]) {
    await t.test(`${description} cannot close the injected script element`, async () => {
      const { response } = await get('/', { config });
      const html = await response.text();
      assert.ok(
        !html.includes('</script><script>alert(1)'),
        `${description} closed the script element it was embedded in`,
      );
    });
  }

  await t.test('an embedded config key survives as data, not markup', async () => {
    const slug = '/x</script>y';
    const config = baseConfig({ slugToPage: { '/': PAGE.home, [slug]: PAGE.about } });
    const { response } = await get('/', { config });
    const html = await response.text();
    // Escaped rather than dropped: the browser must still see the real slug, or
    // client-side URL translation would silently stop matching it.
    assert.match(html, /u003c\/script>y/, 'the key was mangled instead of escaped');
  });

  await t.test('googleFont is restricted to font-name characters', async () => {
    const config = baseConfig({ googleFont: "Inter'; } body { display:none } /*" });
    const { response } = await get('/', { config });
    const html = await response.text();
    // Assert on the value that was actually emitted. Checking the surrounding
    // markup would trip over the bundled stylesheet, which has rules of its own.
    const declared = /font-family: "([^"]*)"/.exec(html)?.[1];
    const queried = /[?&]family=([^:&']*)/.exec(html)?.[1];
    assert.ok(declared !== undefined, 'no font-family declaration was emitted');
    assert.ok(queried !== undefined, 'no family query parameter was emitted');
    assert.match(declared, /^[A-Za-z0-9 -]*$/, `font name reached CSS unsanitized: ${declared}`);
    assert.match(queried, /^[A-Za-z0-9+-]*$/, `font name reached the URL unsanitized: ${queried}`);
    assert.ok(declared.startsWith('Inter'), 'the legitimate part of the font name was lost');
  });

  await t.test('googleTagID is restricted to measurement-ID characters', async () => {
    const config = baseConfig({ googleTagID: "G-1');alert(1);('" });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.ok(!html.includes('alert(1)'), 'googleTagID injected script');
    assert.ok(html.includes('G-1'), 'the legitimate part of the tag id was lost');
  });

  await t.test('ordinary values are left intact', async () => {
    const config = baseConfig({
      siteName: 'My Site',
      twitterHandle: '@handle',
      googleFont: 'Open Sans',
      googleTagID: 'G-ABC123',
    });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.match(html, /content="My Site"/);
    assert.match(html, /content="@handle"/);
    assert.match(html, /family=Open\+Sans/);
    assert.match(html, /id=G-ABC123/);
  });
});

test('request handling', { skip }, async (t) => {
  await t.test('a plain OPTIONS request is answered without touching the upstream', async () => {
    const { response, upstream } = await get('/', { init: { method: 'OPTIONS' } });
    assert.equal(upstream.length, 0);
    assert.equal(response.headers.get('allow'), 'GET, HEAD, POST, PUT, OPTIONS');
  });

  await t.test('a CORS preflight gets the cors headers instead', async () => {
    const { response, upstream } = await get('/', {
      init: {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://other.example',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      },
    });
    assert.equal(upstream.length, 0);
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, POST, PUT, OPTIONS');
  });

  await t.test('the upstream request drops accept-encoding so the body stays rewritable', async () => {
    const { upstream } = await get('/', { init: { headers: { 'accept-encoding': 'gzip, br' } } });
    assert.equal(upstream[0].headers.get('accept-encoding'), null);
  });

  await t.test('an upstream failure does not leak the error to the visitor', async () => {
    const { response } = await quietly(() =>
      get('/', { respond: respondWith.failure('upstream exploded with secret detail') }),
    );
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.ok(!body.includes('secret detail'), 'internal error text reached the response');
  });
});
