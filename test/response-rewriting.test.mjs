// What the proxy does to a response body: which ones it rewrites, which it
// streams through untouched, and what it injects into the ones it does rewrite.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GENERATED, readGeneratedConstant } from './helpers/generated.mjs';
import { baseConfig, createProxy, get, PAGE, respondWith, skip } from './helpers/harness.mjs';

test('client runtime injection', { skip }, async (t) => {
  await t.test('the browser translator is injected', async () => {
    const { response } = await get('/');
    const html = await response.text();
    assert.ok(html.includes('window.nooxy'), 'head.js was not injected');
    assert.ok(html.includes('_yourUrl'), 'the URL translator is missing');
  });

  await t.test('the slug maps are injected so the browser can translate', async () => {
    const { response } = await get('/');
    const html = await response.text();
    assert.ok(html.includes(`"/about":"${PAGE.about}"`), 'slugToPage was not injected');
    assert.ok(html.includes(`"${PAGE.about}":"/about"`), 'pageToSlug was not injected');
  });

  await t.test('custom CSS, JS and header are injected', async () => {
    const config = baseConfig({
      customHeadCSS: '.marker-css{color:red}',
      customHeadJS: 'var markerHeadJs=1;',
      customBodyJS: 'var markerBodyJs=1;',
      customHeader: '<div>marker-header</div>',
    });
    const { response } = await get('/', { config });
    const html = await response.text();
    for (const marker of ['.marker-css{color:red}', 'var markerHeadJs=1;', 'var markerBodyJs=1;', 'marker-header']) {
      assert.ok(html.includes(marker), `${marker} was not injected`);
    }
  });

  await t.test('the badge is on by default and can be turned off', async () => {
    const on = await (await get('/')).response.text();
    assert.ok(on.includes('showBadge=true'), 'the badge default changed');
    const off = await (await get('/', { config: baseConfig({ nooxy: { showBadge: false } }) })).response.text();
    assert.ok(off.includes('showBadge=false'), 'showBadge:false was ignored');
  });

  await t.test('nothing is injected twice', async () => {
    const { response } = await get('/');
    const html = await response.text();
    assert.equal((html.match(/window\.nooxy=/g) ?? []).length, 1, 'the runtime was injected more than once');
  });
});

test('URL rewriting in HTML', { skip }, async (t) => {
  await t.test('the Notion domain is replaced with the site domain', async () => {
    const { response } = await get('/', {
      respond: respondWith.html('<html><head></head><body><a href="https://space.notion.site/x">l</a></body></html>'),
    });
    const html = await response.text();
    assert.ok(html.includes('https://example.com/x'), 'the Notion domain was not rewritten');
    assert.ok(!html.includes('href="https://space.notion.site'), 'a Notion URL survived');
  });

  await t.test('a lookalike domain is not rewritten', async () => {
    const { response } = await get('/', {
      respond: respondWith.html(
        '<html><head></head><body><a href="https://space.notion.site.evil.com/x">l</a></body></html>',
      ),
    });
    assert.ok((await response.text()).includes('space.notion.site.evil.com'), 'a lookalike host was rewritten');
  });

  await t.test('asset scripts get a cache-busting parameter', async () => {
    const { response } = await get('/');
    assert.match(await response.text(), /\/_assets\/app-abc\.js\?nooxy=\d+/);
  });
});

test('JavaScript bundle patching', { skip }, async (t) => {
  await t.test('location.href reads are routed through the translator', async () => {
    const { response } = await get('/_assets/app.js', {
      respond: respondWith.javascript('var u=window.location.href;'),
    });
    assert.match(await response.text(), /window\.nooxy\.href\(\)/);
  });

  await t.test('assignments to location.href are left alone', async () => {
    const { response } = await get('/_assets/app.js', {
      respond: respondWith.javascript('window.location.href="/x";'),
    });
    assert.match(await response.text(), /window\.location\.href="\/x"/);
  });

  // The patched bundle has to still parse, whatever shape the call took. Two
  // earlier forms of this rewrite each broke half the cases: 'return;$&' only
  // worked where the call was a statement, and matching a bare \w+ only worked
  // where the callee had no dots — while a dotted callee is the common shape in
  // minified code, so that one would have killed the bundle on a real page.
  for (const [description, bundle] of [
    ['a bare statement', 'Sentry.init({dsn:"x"});'],
    ['a member expression', 'window.Sentry.init({dsn:"x"});'],
    ['a minified member', 'e.Sentry.init({dsn:"x"});'],
    ['a chained callee', 'a.b.Sentry.init({dsn:"x"});'],
    ['expression position', 'var s=(Sentry.init({dsn:"x"}));'],
    ['a call argument', 'f(Sentry.init({dsn:"x"}));'],
    ['a return value', 'function g(){return Sentry.init({dsn:"x"})}'],
  ]) {
    await t.test(`Sentry is neutralised and the bundle still parses — ${description}`, async () => {
      const { response } = await get('/_assets/app.js', { respond: respondWith.javascript(bundle) });
      const patched = await response.text();

      assert.doesNotThrow(() => new Function(patched), `the patched bundle no longer parses:\n${patched}`);
      assert.ok(!/(?<!\}\))\.init\(\{dsn:/.test(patched), `Sentry.init survived:\n${patched}`);
    });
  }

  await t.test('the public domain interstitial flag is neutralized', async () => {
    const { response } = await get('/_assets/app.js', {
      respond: respondWith.javascript('{publicDomainName:cfg.publicDomainName}'),
    });
    assert.match(await response.text(), /publicDomainName:void 0/);
  });
});

test('responses that must not be rewritten', { skip }, async (t) => {
  await t.test('a binary content type is streamed through byte for byte', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
    const proxy = createProxy(baseConfig(), respondWith.binary(bytes));
    const response = await proxy.fetch('https://example.com/_assets/logo.png');
    const received = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...received], [...bytes], 'binary bytes were corrupted');
  });

  await t.test('a missing content type is treated as binary', async () => {
    // Built by hand: respondWith always sets a content type, and the absence of
    // one is exactly what this asserts.
    const proxy = createProxy(baseConfig(), () => new Response('<html><head></head></html>', { headers: {} }));
    const response = await proxy.fetch('https://example.com/_assets/unknown');
    assert.ok(!(await response.text()).includes('window.nooxy'), 'an untyped response was rewritten');
  });

  await t.test('a 304 is returned with no body', async () => {
    const proxy = createProxy(baseConfig(), respondWith.notModified());
    const response = await proxy.fetch('https://example.com/_assets/app.js');
    assert.equal(response.status, 304);
    assert.equal(response.body, null);
  });

  // Notion loads page content as JSON, and a page about web development contains
  // the text "<html" like any other word. Deciding HTML by sniffing the body for
  // that string treated such a response as a document, and the meta rewriter then
  // wrote tags into it and broke the JSON the browser was about to parse.
  await t.test('a JSON body that merely mentions <html is not treated as a document', async () => {
    // Two independent things protect this, so both are asserted. The document
    // rewrites (meta tags, script injection, domain replacement) all live behind
    // the same content-type check, and the domain replacement is the one that
    // leaves a visible trace in a body with no <head> to inject into.
    const payload = JSON.stringify({
      block: { text: 'my notes about <html and <!DOCTYPE' },
      icon: 'https://space.notion.site/icon.png',
    });
    const config = baseConfig({
      slugToPage: { '/': PAGE.home, '/notes': PAGE.about },
      pageMetadata: { [PAGE.about]: { title: 'Notes', description: 'about markup' } },
    });
    const proxy = createProxy(config, () => new Response(payload, { headers: { 'content-type': 'application/json' } }));
    const response = await proxy.fetch(`https://example.com/${PAGE.about}`);
    const body = await response.text();

    assert.doesNotThrow(() => JSON.parse(body), `the JSON response was corrupted:\n${body}`);
    assert.ok(!body.includes('<meta '), 'meta tags were written into a JSON response');
    assert.ok(body.includes('https://space.notion.site/icon.png'), 'the document rewrites ran against a JSON body');
  });

  await t.test('an HTML document with no head is left structurally intact', async () => {
    // Nothing to insert into, so nothing is inserted. The old fallback appended
    // after </html>, where a browser ignores it anyway.
    const config = baseConfig({
      slugToPage: { '/': PAGE.home, '/frag': PAGE.about },
      pageMetadata: { [PAGE.about]: { title: 'T' } },
    });
    const proxy = createProxy(config, respondWith.html('<html><body>fragment</body></html>'));
    const body = await (await proxy.fetch(`https://example.com/${PAGE.about}`)).text();
    assert.ok(!/<\/html>\s*<meta/i.test(body), `a meta tag was appended after </html>:\n${body}`);
  });

  await t.test('image paths are passed straight back', async () => {
    // Deliberately text/html: the point is that an /image/ path is passed
    // through on the strength of its path, whatever the content type claims.
    const proxy = createProxy(baseConfig(), respondWith.html('RAWIMAGE'));
    const response = await proxy.fetch('https://example.com/image/abc');
    assert.equal(await response.text(), 'RAWIMAGE', 'an image response was rewritten');
  });
});

test('the upstream status is preserved', { skip }, async (t) => {
  for (const status of [200, 201, 404, 410, 500]) {
    await t.test(`status ${status}`, async () => {
      const proxy = createProxy(baseConfig(), respondWith.status(status));
      const response = await proxy.fetch('https://example.com/about');
      assert.equal(response.status, status);
    });
  }
});

// Injection goes through String.replace(), where '$&', '$`', "$'" and '$n' in
// the replacement are substitution patterns rather than literal text. Config
// values pass through both rewriters, so they are checked together here.
test('values reach the page verbatim, not expanded as replacement patterns', { skip }, async (t) => {
  await t.test('the browser bundle is injected byte for byte', async () => {
    const { response } = await get('/');
    const html = await response.text();
    assert.ok(html.includes(readGeneratedConstant(GENERATED.headJs)), 'head.js was altered on the way into the page');
  });

  await t.test('custom CSS containing $& survives', async () => {
    const css = 'body::after{content:"$& $` cost"}';
    const { response } = await get('/', { config: baseConfig({ customHeadCSS: css }) });
    assert.ok((await response.text()).includes(css), 'custom CSS was corrupted');
  });

  await t.test('custom body JS containing $& survives', async () => {
    const js = "console.log('$&');";
    const { response } = await get('/', { config: baseConfig({ customBodyJS: js }) });
    assert.ok((await response.text()).includes(js), 'custom body JS was corrupted');
  });

  await t.test('a page title containing $& is not expanded', async () => {
    const config = baseConfig({
      pageMetadata: { [PAGE.home]: { title: 'Save $& Now', description: 'Costs $` less' } },
    });
    const { response } = await get('/', { config });
    const html = await response.text();
    assert.match(html, /<title>Save \$&amp; Now<\/title>/);
    assert.ok(html.includes('content="Costs $` less"'), 'the description was corrupted');
  });

  await t.test('siteName containing $& is not expanded', async () => {
    const { response } = await get('/', { config: baseConfig({ siteName: 'A $& B' }) });
    assert.ok(!(await response.text()).includes('A <meta'), 'siteName expanded into the matched tag');
  });
});
