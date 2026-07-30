// SEO metadata rewriting: what the proxy does to the <head> Notion returns.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, get, htmlFor, PAGE, respondWith, skip } from './helpers/harness.mjs';

test('search engine indexing', { skip }, async (t) => {
  await t.test('Notion’s noindex is removed by default', async () => {
    const html = await htmlFor('/');
    assert.ok(!/content="noindex/.test(html), 'noindex survived');
    assert.match(html, /<meta name="robots" content="index, follow/);
  });

  await t.test('a canonical link is added for the requested slug', async () => {
    assert.match(await htmlFor('/about'), /<link rel="canonical" href="https:\/\/example\.com\/about"\/>/);
  });

  await t.test('Notion’s own canonical link is removed first', async () => {
    const html = await htmlFor('/');
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, 'more than one canonical link');
    assert.ok(!html.includes('href="https://space.notion.site/x"'), 'the upstream canonical survived');
  });

  await t.test('indexing:false leaves the page unindexed', async () => {
    const html = await htmlFor('/', baseConfig({ seo: { indexing: false } }));
    assert.match(html, /content="noindex/, 'noindex was stripped despite indexing:false');
    assert.ok(!html.includes('content="index, follow'), 'an index directive was added anyway');
    // Notion's own canonical is still domain-rewritten, but no slug-derived
    // canonical is generated.
    assert.ok(!html.includes('href="https://example.com/"'), 'a canonical was generated for the slug');
  });
});

test('canonical URL construction', { skip }, async (t) => {
  await t.test('uses the site domain by default', async () => {
    assert.match(await htmlFor('/about'), /content="https:\/\/example\.com\/about"/);
  });

  await t.test('uses canonicalDomain when configured', async () => {
    const config = baseConfig({ seo: { canonicalDomain: 'canonical.example' } });
    assert.match(await htmlFor('/about', config), /href="https:\/\/canonical\.example\/about"/);
  });

  await t.test('applies canonicalPathMap', async () => {
    const config = baseConfig({
      seo: { canonicalDomain: 'canonical.example', canonicalPathMap: { '/': '/home' } },
    });
    assert.match(await htmlFor('/', config), /href="https:\/\/canonical\.example\/home"/);
  });

  await t.test('keeps the request protocol', async () => {
    const { response } = await get('http://example.com/about');
    assert.match(await response.text(), /href="http:\/\/example\.com\/about"/);
  });
});

test('social metadata', { skip }, async (t) => {
  await t.test('og:site_name becomes the configured site name', async () => {
    assert.match(await htmlFor('/'), /<meta property="og:site_name" content="Test Site"\/>/);
  });

  await t.test('og:url and twitter:url become the canonical URL', async () => {
    const html = await htmlFor('/about');
    assert.match(html, /<meta property="og:url" content="https:\/\/example\.com\/about"\/>/);
    assert.match(html, /<meta name="twitter:url" content="https:\/\/example\.com\/about"\/>/);
  });

  await t.test('twitter:site becomes the configured handle', async () => {
    const html = await htmlFor('/', baseConfig({ twitterHandle: '@mysite' }));
    assert.match(html, /<meta name="twitter:site" content="@mysite"\/>/);
  });

  await t.test('twitter:site is dropped when no handle is configured', async () => {
    assert.ok(!(await htmlFor('/')).includes('twitter:site'), 'the upstream twitter:site survived');
  });

  await t.test('the App Store banner is removed', async () => {
    assert.ok(!(await htmlFor('/')).includes('apple-itunes-app'));
  });
});

test('branding replacement', { skip }, async (t) => {
  await t.test('"Notion" in the title becomes the site name', async () => {
    assert.match(await htmlFor('/'), /<title>Test Site<\/title>/);
  });

  await t.test('"Notion" in meta content becomes the site name', async () => {
    assert.match(await htmlFor('/'), /content="a Test Site page"/);
  });

  await t.test('brandReplacement overrides the site name', async () => {
    const html = await htmlFor('/', baseConfig({ seo: { brandReplacement: 'Acme' } }));
    assert.match(html, /<title>Acme<\/title>/);
    assert.match(html, /content="a Acme page"/);
  });

  // `\bNotion\b`, so anything with a letter either side must survive intact. One
  // case proved the boundary existed; these pin both edges of it.
  for (const [description, word] of [
    ['a longer word ending in it', 'Notionally'],
    ['a longer word starting with it', 'preNotion'],
    ['it embedded mid-word', 'unNotionlike'],
  ]) {
    await t.test(`only whole words are replaced — ${description}`, async () => {
      const respond = respondWith.html(`<html><head><title>${word}</title></head><body></body></html>`);
      const { response } = await get('/', { respond });
      assert.match(await response.text(), new RegExp(`<title>${word}</title>`), `${word} was mangled`);
    });
  }

  await t.test('a whole word IS replaced, so the boundary is not just refusing everything', async () => {
    const respond = respondWith.html("<html><head><title>Notion's page</title></head><body></body></html>");
    const { response } = await get('/', { respond });
    const title = (await response.text()).match(/<title>([^<]*)<\/title>/)?.[1];
    assert.ok(!title?.startsWith('Notion'), `branding was not applied at all: ${title}`);
  });
});

test('config values cannot escape the tags they are written into', { skip }, async (t) => {
  // Everything here comes from the site owner's own config file. That is not a
  // hostile source, but a typo or an ampersand in a company name should not
  // produce a corrupt page, and a config shared between tenants makes it a
  // genuine boundary.

  await t.test('a $ substitution pattern in the site name is inserted literally', async () => {
    // These tags are written with String.replace. Passing the tag as the
    // replacement *string* rather than a function makes $&, $`, $' and $1
    // expand against the match, splicing the surrounding document into the
    // value. The escaping below is what proves a replacer function is used.
    const html = await htmlFor('/', baseConfig({ siteName: 'Ac$&me' }));
    const content = html.match(/og:site_name" content="([^"]*)"/)[1];
    assert.equal(content, 'Ac$&amp;me', `the pattern expanded: ${content}`);
    assert.ok(!content.includes('<meta'), 'part of the document was spliced into the value');
  });

  for (const [description, siteName] of [
    ['$` (everything before the match)', 'Ac$`me'],
    ["$' (everything after the match)", "Ac$'me"],
    ['$1 (a capture group)', 'Ac$1me'],
    ['a bare $', 'Ac$me'],
  ]) {
    await t.test(`${description} survives as written`, async () => {
      const html = await htmlFor('/', baseConfig({ siteName }));
      const content = html.match(/og:site_name" content="([^"]*)"/)[1];
      assert.ok(content.startsWith('Ac$'), `the pattern was consumed: ${content}`);
      assert.ok(content.endsWith('me'), `the tail was lost: ${content}`);
      assert.ok(!content.includes('<'), `markup leaked into the value: ${content}`);
    });
  }

  // og:title and friends are the tags written through upsertMetaTag, so a page
  // title is where a $ pattern actually reaches String.replace. Site-wide
  // values above take a different path; both are covered so neither can regress
  // alone.
  for (const [description, title] of [
    ['$&', 'Ac$&me'],
    ['$`', 'Ac$`me'],
    ["$'", "Ac$'me"],
    ['$1', 'Ac$1me'],
  ]) {
    await t.test(`${description} in a page title is inserted literally`, async () => {
      const config = baseConfig({ pageMetadata: { [PAGE.about]: { title } } });
      // The upstream must already carry og:title, or upsertMetaTag appends the
      // tag instead of replacing one and the substitution never gets the chance
      // to fire. Real Notion pages do carry it; the default harness page does
      // not, which is exactly how this hole stayed open.
      const respond = respondWith.html(
        '<html><head><meta property="og:title" content="Notion"/></head><body>x</body></html>',
      );
      const { response } = await get('/about', { config, respond });
      const html = await response.text();
      const content = html.match(/og:title" content="([^"]*)"/)[1];
      assert.ok(content.startsWith('Ac$'), `the pattern was consumed: ${content}`);
      assert.ok(content.endsWith('me'), `the tail was lost: ${content}`);
      assert.ok(!content.includes('meta'), `a tag was spliced into the title: ${content}`);
    });
  }

  // A quote is what ends an attribute value, so it is the character that turns
  // a config string into markup. Escaped, the rest of the value stays inert
  // text inside href — which is why the assertion counts delimiters rather than
  // looking for the word "onload", which legitimately survives as content.
  const quoteDelimiters = (tag) => (tag.match(/"/g) ?? []).length;

  for (const [field, overrides] of [
    ['seo.canonicalDomain', { seo: { canonicalDomain: 'evil"onload=alert(1) x="' } }],
    ['domain', { domain: 'evil"onload=alert(1) x="' }],
  ]) {
    await t.test(`a quote in ${field} cannot open a new attribute`, async () => {
      const html = await htmlFor('/about', baseConfig(overrides));
      const link = html.match(/<link[^>]*rel="canonical"[^>]*>/)[0];
      assert.equal(quoteDelimiters(link), 4, `the value broke out of its attribute: ${link}`);
      assert.match(link, /&quot;/, 'the quote was not escaped');
    });
  }
});

test('page specific metadata', { skip }, async (t) => {
  const config = baseConfig({
    pageMetadata: {
      [PAGE.about]: {
        title: 'About Us',
        description: 'Who we are',
        image: 'https://cdn.example/og.png',
        author: 'Jane',
      },
    },
  });

  await t.test('title is overridden', async () => {
    assert.match(await htmlFor('/about', config), /<title>About Us<\/title>/);
  });

  await t.test('description is overridden', async () => {
    assert.match(await htmlFor('/about', config), /<meta name="description" content="Who we are"\/>/);
  });

  await t.test('image is applied to og:image', async () => {
    const html = await htmlFor('/about', config);
    assert.ok(html.includes('https://cdn.example/og.png'), 'og:image was not set');
  });

  await t.test('metadata for one page does not leak to another', async () => {
    assert.ok(!(await htmlFor('/', config)).includes('About Us'));
  });

  await t.test('seo.defaultAuthor is used when a page has no author', async () => {
    const withDefault = baseConfig({ seo: { defaultAuthor: 'Default Author' } });
    assert.match(await htmlFor('/', withDefault), /content="Default Author"/);
  });
});

test('optional SEO tags', { skip }, async (t) => {
  await t.test('keywords are added when configured', async () => {
    const html = await htmlFor('/', baseConfig({ seo: { keywords: 'a, b, c' } }));
    assert.match(html, /<meta name="keywords" content="a, b, c"\/>/);
  });

  await t.test('keywords are absent when not configured', async () => {
    assert.ok(!(await htmlFor('/')).includes('name="keywords"'));
  });

  await t.test('AI attribution tags are added when configured', async () => {
    const html = await htmlFor('/', baseConfig({ seo: { aiAttribution: 'Jane - example.com' } }));
    assert.match(html, /<meta name="ai:source_attribution" content="Jane - example\.com"\/>/);
    assert.match(html, /<meta name="ai:source_url" content="https:\/\/example\.com\/"\/>/);
  });
});

test('a meta tag is replaced, never duplicated', { skip }, async (t) => {
  // '>' is legal unescaped inside an attribute value. Matching attributes with
  // [^>]* cannot cross it, so the existing tag was missed and a second one was
  // inserted beside it — two description tags, which is worse for SEO than the
  // wrong one.
  const config = baseConfig({
    slugToPage: { '/': PAGE.home, '/p': PAGE.about },
    pageMetadata: { [PAGE.about]: { description: 'configured' } },
  });

  const HEADS = [
    ['content after name', '<meta name="description" content="a > b"/>'],
    ['content before name', '<meta content="a > b" name="description"/>'],
    ['single-quoted value', "<meta content='a > b' name='description'/>"],
    ['no > at all', '<meta name="description" content="plain"/>'],
  ];

  for (const [description, head] of HEADS) {
    await t.test(`${description}`, async () => {
      const { response } = await get(`/${PAGE.about}`, {
        config,
        respond: respondWith.html(`<html><head>${head}</head><body>x</body></html>`),
      });
      const html = await response.text();
      const count = (html.match(/name=["']description["']/gi) ?? []).length;
      assert.equal(count, 1, `expected exactly one description tag, found ${count}:\n${html}`);
      assert.match(html, /content="configured"/, 'the configured description was not applied');
    });
  }
});

test('the author tag survives whatever the upstream page happens to contain', { skip }, async (t) => {
  // article:author was the one page-metadata field still applied with the older
  // pattern: replace if Notion emitted the tag, else insert after og:locale, else
  // silently do nothing. So a configured author disappeared whenever the upstream
  // had neither tag — and with indexing disabled the name="author" tag added
  // elsewhere is absent too, losing it completely.
  const config = baseConfig({
    slugToPage: { '/': PAGE.home, '/who': PAGE.about },
    pageMetadata: { [PAGE.about]: { author: 'Ada Lovelace' } },
  });
  const withIndexing = (indexing) => baseConfig({ ...config, seo: { indexing } });

  const HEADS = [
    ['the page already has article:author', '<meta name="article:author" content="Someone Else"/>'],
    ['the page has only og:locale', '<meta property="og:locale" content="en_US"/>'],
    ['the page has neither', '<title>t</title>'],
  ];

  for (const [description, head] of HEADS) {
    for (const indexing of [true, false]) {
      await t.test(`${description}, indexing ${indexing ? 'on' : 'off'}`, async () => {
        const { response } = await get(`/${PAGE.about}`, {
          config: withIndexing(indexing),
          respond: respondWith.html(`<html><head>${head}</head><body>x</body></html>`),
        });
        const html = await response.text();
        assert.match(
          html,
          /name="article:author" content="Ada Lovelace"/,
          'the configured author was dropped for this page shape',
        );
      });
    }
  }
});

test('JSON-LD', { skip }, async (t) => {
  await t.test('a brand containing a quote does not break the schema', async () => {
    // Branding used to be applied to the raw JSON text before parsing, so a quote
    // in the brand produced invalid JSON: the parse threw, the catch swallowed it,
    // and the block was emitted with "Notion" still in it.
    const upstream =
      '<html><head><script type="application/ld+json">' +
      '{"@type":"WebPage","name":"x","description":"A Notion page","url":"u"}' +
      '</script></head><body></body></html>';
    const { response } = await get('/', {
      config: baseConfig({ seo: { brandReplacement: 'My "Brand"' } }),
      respond: respondWith.html(upstream),
    });
    const html = await response.text();
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

    const parsed = JSON.parse(block);
    assert.equal(parsed.description, 'A My "Brand" page', 'the brand was not applied to the schema');
  });

  await t.test('a WebPage schema is injected when the page has none', async () => {
    const html = await htmlFor('/about');
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(match, 'no ld+json block was injected');
    const data = JSON.parse(match[1]);
    assert.equal(data['@type'], 'WebPage');
    assert.equal(data.url, 'https://example.com/about');
    assert.equal(data.name, 'Test Site');
  });

  await t.test('an existing schema is updated rather than duplicated', async () => {
    const respond = respondWith.html(
      '<html><head><script type="application/ld+json">{"@type":"WebPage","name":"Notion","url":"https://space.notion.site/x"}</script></head><body></body></html>',
    );
    const { response } = await get('/about', { respond });
    const html = await response.text();
    assert.equal((html.match(/application\/ld\+json/g) ?? []).length, 1, 'schema was duplicated');
    const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(data.name, 'Test Site');
    assert.equal(data.url, 'https://example.com/about');
  });
});
