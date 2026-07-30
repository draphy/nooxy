// Response header handling: cookies, framing, CSP, and the headers that go
// stale once the body has been rewritten.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, respondWith, skip } from './helpers/harness.mjs';

const withHeaders = (headers) => createProxy(baseConfig(), respondWith.html(undefined, headers));

test('cookies are re-scoped to the site domain', { skip }, async (t) => {
  const CASES = [
    ['notion.site', 'a=1; Domain=notion.site; Path=/'],
    ['a notion.site subdomain', 'a=1; Domain=space.notion.site; Path=/'],
    ['notion.so', 'a=1; Domain=notion.so; Path=/'],
    ['www.notion.so', 'a=1; Domain=www.notion.so; Path=/'],
  ];

  for (const [description, cookie] of CASES) {
    await t.test(description, async () => {
      const proxy = withHeaders({ 'set-cookie': cookie });
      const response = await proxy.fetch('https://example.com/about');
      const received = response.headers.get('set-cookie');
      assert.ok(received.includes('Domain=example.com'), `not re-scoped: ${received}`);
      assert.ok(!received.includes('notion.s'), `a Notion domain survived: ${received}`);
    });
  }

  await t.test('a cookie without a Domain attribute is left alone', async () => {
    const proxy = withHeaders({ 'set-cookie': 'a=1; Path=/; HttpOnly' });
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.headers.get('set-cookie'), 'a=1; Path=/; HttpOnly');
  });

  await t.test('each cookie stays its own header', async () => {
    // Notion sends a signed-in reader several cookies. They used to be joined
    // with a comma and written back as one header, so the browser saw a single
    // malformed cookie and every one after the first was lost.
    const proxy = createProxy(
      baseConfig(),
      respondWith.htmlWithCookies(['token_v2=abc; Domain=notion.site; Path=/', 'notion_user_id=42; Domain=notion.so']),
    );
    const response = await proxy.fetch('https://example.com/about');
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2, `cookies were merged: ${JSON.stringify(cookies)}`);
    assert.ok(
      cookies.every((cookie) => cookie.includes('Domain=example.com')),
      `not every cookie was re-scoped: ${JSON.stringify(cookies)}`,
    );
  });

  await t.test('a cookie whose Expires contains a comma survives intact', async () => {
    // The comma inside an HTTP date is what makes joining Set-Cookie headers
    // impossible to undo.
    const cookie = 'a=1; Domain=notion.site; Expires=Wed, 09 Jun 2027 10:18:14 GMT';
    const proxy = createProxy(baseConfig(), respondWith.htmlWithCookies([cookie, 'b=2; Domain=notion.site']));
    const response = await proxy.fetch('https://example.com/about');
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2, `an HTTP date split the cookie: ${JSON.stringify(cookies)}`);
    assert.ok(cookies[0].includes('Expires=Wed, 09 Jun 2027 10:18:14 GMT'), `Expires mangled: ${cookies[0]}`);
  });

  await t.test('a $ in the request host is not treated as a substitution pattern', async () => {
    // `$'` in a replacement string expands to the text after the match, which
    // used to splice part of the cookie into its own Domain attribute.
    const proxy = createProxy(baseConfig(), respondWith.htmlWithCookies(['a=1; Domain=notion.site; Path=/']));
    const response = await proxy.fetch("https://sub$'x.example.com/about");
    const received = response.headers.get('set-cookie');
    assert.ok(received.includes("Domain=sub$'x.example.com;"), `host was mangled: ${received}`);
    assert.ok(received.endsWith('Path=/'), `the rest of the cookie was corrupted: ${received}`);
  });

  await t.test('security attributes are preserved', async () => {
    const proxy = withHeaders({ 'set-cookie': 'a=1; Domain=notion.site; Secure; HttpOnly; SameSite=Lax' });
    const response = await proxy.fetch('https://example.com/about');
    const received = response.headers.get('set-cookie');
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax']) {
      assert.ok(received.includes(attribute), `${attribute} was dropped`);
    }
  });
});

test('framing and embedding', { skip }, async (t) => {
  await t.test('x-frame-options is removed so the site can be embedded', async () => {
    const proxy = withHeaders({ 'x-frame-options': 'SAMEORIGIN' });
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.headers.get('x-frame-options'), null);
  });

  await t.test('frame-ancestors is relaxed in an existing CSP', async () => {
    const proxy = withHeaders({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" });
    const response = await proxy.fetch('https://example.com/about');
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp.includes('frame-ancestors *'), `frame-ancestors not relaxed: ${csp}`);
    assert.ok(!csp.includes("frame-ancestors 'none'"), 'the original directive survived');
  });

  await t.test('frame-ancestors is added when the CSP has none', async () => {
    const proxy = withHeaders({ 'content-security-policy': "default-src 'self'" });
    const response = await proxy.fetch('https://example.com/about');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors \*/);
  });

  await t.test('no CSP is invented when the upstream sent none', async () => {
    const proxy = withHeaders({});
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.headers.get('content-security-policy'), null);
  });
});

test('CSP is widened for the resources nooxy injects', { skip }, async (t) => {
  await t.test('analytics hosts are allowed in script-src and connect-src', async () => {
    const proxy = withHeaders({
      'content-security-policy': "script-src 'self'; connect-src 'self'; style-src 'self'; font-src 'self'",
    });
    const response = await proxy.fetch('https://example.com/about');
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp.includes('googletagmanager.com'), 'gtag host missing from CSP');
    assert.ok(csp.includes('fonts.googleapis.com'), 'font stylesheet host missing from style-src');
    assert.ok(csp.includes('fonts.gstatic.com'), 'font file host missing from font-src');
  });
});

test('indexing header', { skip }, async (t) => {
  await t.test('X-Robots-Tag allows indexing by default', async () => {
    const proxy = withHeaders({});
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.headers.get('x-robots-tag'), 'index, follow');
  });

  await t.test('X-Robots-Tag is not set when indexing is disabled', async () => {
    const proxy = createProxy(baseConfig({ seo: { indexing: false } }), respondWith.html());
    const response = await proxy.fetch('https://example.com/about');
    assert.equal(response.headers.get('x-robots-tag'), null);
  });
});

test('headers that go stale once the body is rewritten', { skip }, async (t) => {
  const STALE = ['content-encoding', 'content-length', 'content-digest', 'etag'];

  await t.test('are dropped from a rewritten HTML response', async () => {
    const proxy = withHeaders({
      'content-encoding': 'gzip',
      'content-length': '9999',
      'content-digest': 'sha-256=:abc:',
      etag: 'W/"abc"',
    });
    const response = await proxy.fetch('https://example.com/about');
    for (const header of STALE) {
      assert.equal(response.headers.get(header), null, `${header} survived a body rewrite`);
    }
  });

  // content-encoding and content-length describe bytes that fetch has already
  // changed, so they are wrong on *every* path, rewritten or not: fetch
  // transparently decompresses the body but leaves content-encoding in place.
  // Forwarding it labelled decoded bytes as gzip, and the browser then failed to
  // decode them — which broke PDFs, fonts and other attachments on a self-hosted
  // Node deployment. Cloudflare Workers strips the header itself, which is why
  // this was invisible in production.
  for (const [description, path, contentType] of [
    ['a binary passthrough', '/_assets/x.png', 'image/png'],
    ['a file attachment', '/file.pdf', 'application/pdf'],
  ]) {
    await t.test(`content-encoding never survives ${description}`, async () => {
      const proxy = createProxy(
        baseConfig(),
        respondWith.binary('binary', contentType, { 'content-encoding': 'gzip', 'content-length': '6' }),
      );
      const response = await proxy.fetch(`https://example.com${path}`);
      assert.equal(response.headers.get('content-encoding'), null, 'decoded bytes were labelled as gzip');
      assert.equal(response.headers.get('content-length'), null, 'a compressed length described a decoded body');
    });
  }

  // content-length is only wrong in the two cases where the length actually
  // changed. Dropping it unconditionally also stripped it from an uncompressed
  // byte-for-byte passthrough, where it was correct — losing the length on a 206
  // range response and the progress indication on a large attachment.
  await t.test('content-length survives an uncompressed passthrough', async () => {
    const proxy = createProxy(baseConfig(), respondWith.binary('BYTES', 'application/pdf', { 'content-length': '5' }));
    const response = await proxy.fetch('https://example.com/a.pdf');
    assert.equal(response.headers.get('content-length'), '5', 'a correct length was discarded');
  });

  await t.test('a 206 range response keeps both content-range and content-length', async () => {
    const proxy = createProxy(
      baseConfig(),
      () =>
        new Response('PART', {
          status: 206,
          headers: { 'content-type': 'application/pdf', 'content-range': 'bytes 0-3/100', 'content-length': '4' },
        }),
    );
    const response = await proxy.fetch('https://example.com/c.pdf');
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
    assert.equal(response.headers.get('content-length'), '4', 'a range response lost its length');
  });

  await t.test('validators are kept on a passthrough response, whose body is unchanged', async () => {
    const proxy = createProxy(
      baseConfig(),
      respondWith.binary('binary', 'image/png', { etag: 'W/"abc"', 'content-digest': 'sha-256=:abc:' }),
    );
    const response = await proxy.fetch('https://example.com/_assets/x.png');
    assert.equal(response.headers.get('etag'), 'W/"abc"', 'etag was dropped from an untouched body');
    assert.equal(response.headers.get('content-digest'), 'sha-256=:abc:');
  });

  await t.test('are kept on a 304, which has no body to invalidate them', async () => {
    const proxy = createProxy(baseConfig(), respondWith.notModified({ etag: 'W/"abc"' }));
    const response = await proxy.fetch('https://example.com/_assets/app.js');
    assert.equal(response.headers.get('etag'), 'W/"abc"');
  });
});
