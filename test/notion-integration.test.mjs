// The rewriters against real Notion HTML.
//
// Every other proxy test feeds the harness a small hand-written page. That page
// was written to match what the rewriters expect, so it can only confirm they do
// what I already believed — it cannot catch an assumption that was wrong about
// Notion in the first place.
//
// test/fixtures/notion-page.html is the genuine article: the shell Notion serves
// for a public page, captured from a live site. It is Notion's app shell only —
// page content loads over the API afterwards — so it carries no author content,
// just the head, the loading spinner and the bundle tags.
//
// It differs from the synthetic page in ways that matter:
//
//   - real Notion writes every one of its meta tags unclosed — `<meta name="x"
//     content="y">` — while the synthetic page closes every one of them as
//     `<meta ... />`. This is the difference that earns the fixture its place:
//     tightening createMetaPattern to require a self-closing slash breaks 11
//     tests here and none at all in meta-rewriter.test.mjs. A change that would
//     have failed to rewrite a single tag on any real page shipped green.
//   - og:url and twitter:url point at https://app.notion.com, not at the
//     configured notionDomain, so a rewrite that works by substituting the
//     Notion domain would silently leave them alone.
//   - there is no <link rel="canonical"> at all, so the strip-then-append path
//     runs with nothing to strip.
//   - the descriptions contain apostrophes and the titles contain a pipe, both
//     of which have to survive brand replacement untouched.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { baseConfig, createProxy, PAGE, skip } from './helpers/harness.mjs';
import { ROOT } from './helpers/generated.mjs';

const NOTION_PAGE = fs.readFileSync(path.join(ROOT, 'test/fixtures/notion-page.html'), 'utf8');

/** Serves the captured page as the upstream response. */
function proxyForRealPage(overrides = {}) {
  const config = baseConfig({ siteName: 'My Site', twitterHandle: '@mysite', ...overrides });
  return createProxy(config, () => new Response(NOTION_PAGE, { headers: { 'content-type': 'text/html' } }));
}

const metaContent = (html, key) => {
  const match = html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*>`));
  return match ? (match[0].match(/content="([^"]*)"/) ?? [])[1] : null;
};

test('the captured fixture is the input this suite thinks it is', { skip }, async (t) => {
  // If the fixture is ever refreshed from a newer Notion, these are the
  // properties the tests below depend on. Losing one silently would turn the
  // whole file into a weaker version of the synthetic tests.
  await t.test('it is a real Notion shell, not a rewritten nooxy page', () => {
    assert.match(NOTION_PAGE, /class="notion-body"/);
    assert.ok(!NOTION_PAGE.includes('window.nooxy'), 'the fixture has already been through nooxy');
  });

  await t.test('it has no canonical tag, so there is nothing to strip', () => {
    assert.ok(!/rel="canonical"/.test(NOTION_PAGE), 'the fixture gained a canonical tag');
  });

  await t.test('every one of its meta tags is unclosed', () => {
    // The property this whole file rests on. If a refreshed capture ever closed
    // every tag, the fixture would quietly become a second synthetic page.
    //
    // Asserted exactly rather than as ">= 10": the capture has 20 meta tags and
    // 0 self-closing ones, so a mixed refresh — half of them closed — would have
    // passed the old threshold while halving what this fixture actually exercises.
    const all = NOTION_PAGE.match(/<meta\b[^>]*>/g) ?? [];
    const selfClosing = all.filter((tag) => tag.endsWith('/>'));
    assert.ok(all.length >= 10, `expected a meaningful number of meta tags, found ${all.length}`);
    assert.deepEqual(
      selfClosing,
      [],
      `the capture now has self-closing meta tags, so it no longer pins the unclosed case:\n${selfClosing.join('\n')}`,
    );
  });

  await t.test('its social URLs do not point at the configured notionDomain', () => {
    assert.equal(metaContent(NOTION_PAGE, 'og:url'), 'https://app.notion.com');
    assert.ok(!NOTION_PAGE.includes('space.notion.site/x'), 'the fixture looks synthetic');
  });

  await t.test('it carries the punctuation that breaks naive replacement', () => {
    assert.match(metaContent(NOTION_PAGE, 'og:title'), /\|/, 'no pipe in the upstream title');
    assert.match(metaContent(NOTION_PAGE, 'og:description'), /'/, 'no apostrophe in the upstream description');
  });
});

test('a configured page, rewritten from real Notion HTML', { skip }, async (t) => {
  const configured = () =>
    proxyForRealPage({
      pageMetadata: {
        [PAGE.about]: { title: 'About Us', description: 'Our story', image: 'https://cdn.example/a.png' },
      },
    });

  const html = async () => (await configured().fetch('https://example.com/about')).text();

  await t.test('the document title comes from the config', async () => {
    assert.equal((await html()).match(/<title[^>]*>([^<]*)</)[1], 'About Us');
  });

  for (const [key, expected] of [
    ['og:title', 'About Us'],
    ['og:description', 'Our story'],
    ['og:image', 'https://cdn.example/a.png'],
    ['twitter:title', 'About Us'],
    ['twitter:image', 'https://cdn.example/a.png'],
    ['description', 'Our story'],
  ]) {
    await t.test(`${key} comes from the config`, async () => {
      assert.equal(metaContent(await html(), key), expected);
    });
  }

  await t.test('canonical is injected even though the upstream had none', async () => {
    const match = (await html()).match(/<link[^>]*rel="canonical"[^>]*>/);
    assert.ok(match, 'no canonical link was added');
    assert.match(match[0], /href="https:\/\/example\.com\/about"/);
  });

  for (const key of ['og:url', 'twitter:url']) {
    await t.test(`${key} is repointed away from app.notion.com`, async () => {
      // The upstream value is https://app.notion.com, which contains neither the
      // configured notionDomain nor the page id, so nothing about it can be
      // rewritten by substitution — it has to be replaced outright.
      assert.equal(metaContent(await html(), key), 'https://example.com/about');
    });
  }

  await t.test('og:site_name and twitter:site follow the config', async () => {
    const out = await html();
    assert.equal(metaContent(out, 'og:site_name'), 'My Site');
    assert.equal(metaContent(out, 'twitter:site'), '@mysite');
  });

  await t.test("Notion's own marketing copy is gone", async () => {
    const out = await html();
    assert.ok(!out.includes('A collaborative AI workspace'), 'the upstream description survived');
    assert.ok(!out.includes('Where teams and agents work together'), 'the upstream tagline survived');
  });

  await t.test('the injected assets are present and the document still closes its head', async () => {
    const out = await html();
    assert.match(out, /window\.nooxy/, 'the head script was not injected');
    assert.equal(out.split('</head>').length - 1, 1, 'the head was closed more than once');
    assert.ok(out.indexOf('window.nooxy') < out.indexOf('</head>'), 'the script landed outside the head');
  });
});

test('an unconfigured page falls back to branded Notion copy', { skip }, async (t) => {
  // Most pages on a new site have no pageMetadata entry. This is what their
  // search snippet and social card actually say, so it is pinned deliberately
  // rather than left to drift.
  const html = async () => (await proxyForRealPage().fetch('https://example.com/about')).text();

  await t.test('the brand is substituted into the upstream title', async () => {
    const title = metaContent(await html(), 'og:title');
    assert.ok(title.startsWith('My Site'), `brand not applied: ${title}`);
    assert.ok(!title.includes('Notion'), `Notion survived in the title: ${title}`);
  });

  await t.test('the pipe in the upstream title is not mangled', async () => {
    // '|' is a regex alternation character; a replacement built by concatenating
    // it into a pattern would quietly match the wrong thing.
    assert.match(metaContent(await html(), 'og:title'), /^My Site \| /);
  });

  await t.test('the apostrophe in the upstream description survives intact', async () => {
    const description = metaContent(await html(), 'og:description');
    assert.match(description, /team's/, `apostrophe was lost or escaped: ${description}`);
    assert.ok(!description.includes('&#39;'), 'the apostrophe was double-escaped');
  });

  await t.test("Notion's default banner is left in place when no image is configured", async () => {
    // Worth knowing: an unconfigured page shares with Notion's logo, not the
    // site's. That is the fallback, not a bug, but it should not change silently.
    assert.equal(metaContent(await html(), 'og:image'), 'https://app.notion.com/images/meta/default.png');
  });
});

test('the rewrite does not damage the surrounding document', { skip }, async (t) => {
  const html = async () => (await proxyForRealPage().fetch('https://example.com/about')).text();

  await t.test('every upstream stylesheet link survives', async () => {
    // Compared by href, not by count. `after >= before` was the old assertion and
    // it could not tell "all present" from "one swapped for another", and an added
    // stylesheet would have masked a dropped one outright.
    const hrefs = (page) =>
      (page.match(/<link[^>]*rel="stylesheet"[^>]*>/g) ?? [])
        .map((tag) => (tag.match(/href="([^"]*)"/) ?? [])[1])
        .filter(Boolean)
        .sort();

    const before = hrefs(NOTION_PAGE);
    assert.ok(before.length > 0, 'the fixture has no stylesheets, so this asserts nothing');

    const after = hrefs(await html());
    const missing = before.filter((href) => !after.includes(href));
    assert.deepEqual(missing, [], `stylesheets were dropped or rewritten: ${missing.join(', ')}`);
  });

  await t.test('the noscript block and loading spinner are untouched', async () => {
    const out = await html();
    assert.match(out, /JavaScript must be enabled in order to use Notion/);
    assert.match(out, /id="initial-loading-spinner"/);
  });

  await t.test('no script tag is left unclosed', async () => {
    const out = await html();
    assert.equal(
      (out.match(/<script[\s>]/g) ?? []).length,
      (out.match(/<\/script>/g) ?? []).length,
      'script tags do not balance after rewriting',
    );
  });
});
