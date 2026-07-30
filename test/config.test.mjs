// ConfigManager: how a user's config is normalized before anything else uses it.
//
// Scope is deliberately narrow. Where those normalized values then end up is
// covered elsewhere — url-mapping owns path resolution, meta-rewriter owns the
// tags, response-rewriting owns the injected body. This file only asserts what
// ConfigManager itself guarantees.

import assert from 'node:assert/strict';
import test from 'node:test';
import { baseConfig, createProxy, htmlFor, PAGE, skip, upstreamFor } from './helpers/harness.mjs';

// The same page id in the three shapes a user might paste into their config.
const CANONICAL = 'abc123def4567890abc123def4567890';
const UPPERCASE = 'ABC123DEF4567890ABC123DEF4567890';
const DASHED = 'abc123de-f456-7890-abc1-23def4567890';

test('page id normalization', { skip }, async (t) => {
  const CASES = [
    ['an uppercase id resolves to the canonical lowercase form', UPPERCASE],
    ['a dashed UUID from the Notion API resolves to the compact form', DASHED],
    ['surrounding whitespace is trimmed', `  ${CANONICAL}  `],
    ['an already canonical id is unchanged', CANONICAL],
  ];

  for (const [description, configured] of CASES) {
    await t.test(description, async () => {
      const config = baseConfig({ slugToPage: { '/': PAGE.home, '/about': configured } });
      assert.equal(await upstreamFor('/about', config), `https://space.notion.site/${CANONICAL}`);
    });
  }

  await t.test('a value that is not a page id is left untouched', async () => {
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/about': 'NOT-A-PAGE-ID' } });
    assert.equal(await upstreamFor('/about', config), 'https://space.notion.site/NOT-A-PAGE-ID');
  });

  await t.test('the 404 page id is normalized too', async () => {
    const config = baseConfig({ fof: { page: UPPERCASE, slug: '/404' } });
    assert.equal(await upstreamFor('/404', config), `https://space.notion.site/${CANONICAL}`);
  });
});

test('pageMetadata is keyed by the normalized id', { skip }, async (t) => {
  // The server lowercases the id it extracts from the path but used to look it
  // up against verbatim config keys, so a non-canonical key silently lost its
  // metadata. Only the lookup is asserted here; the tags themselves belong to
  // meta-rewriter.
  for (const [description, configured] of [
    ['uppercase', UPPERCASE],
    ['dashed', DASHED],
    ['canonical', CANONICAL],
  ]) {
    await t.test(`a ${description} key is still found`, async () => {
      const config = baseConfig({
        slugToPage: { '/': PAGE.home, '/about': configured },
        pageMetadata: { [configured]: { title: 'Custom Title' } },
      });
      assert.match(await htmlFor('/about', config), /<title>Custom Title<\/title>/);
    });
  }
});

test('the caller config object is not mutated', { skip }, async (t) => {
  await t.test('no 404 entry is grafted onto the caller slugToPage', async () => {
    const config = baseConfig({ fof: { page: CANONICAL, slug: '/404' } });
    const snapshot = structuredClone(config.slugToPage);
    await upstreamFor('/', config);
    assert.deepEqual(config.slugToPage, snapshot);
  });

  await t.test('caller page ids are not rewritten in place', async () => {
    const config = baseConfig({ slugToPage: { '/': PAGE.home, '/about': UPPERCASE } });
    await upstreamFor('/about', config);
    assert.equal(config.slugToPage['/about'], UPPERCASE, 'the caller object was normalized in place');
  });
});

// Notion hands out the same page id two ways: a dashed UUID from the API, and
// compact hex in the URL bar. Normalizing collapses them, so entering one page
// twice in two formats silently discarded one entry's title and description.
test('duplicate pageMetadata entries are reported', { skip }, async (t) => {
  const DASHED = 'abc123de-f456-7890-abc1-23def4567890';
  const COMPACT = 'abc123def4567890abc123def4567890';

  // ConfigManager processes the config lazily, on the first request rather than
  // at initializeNooxy, so the warning only surfaces once a page is served.
  const warningsFor = async (pageMetadata) => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const proxy = createProxy(baseConfig({ slugToPage: { '/': COMPACT }, pageMetadata }));
      await proxy.fetch('https://example.com/');
    } finally {
      console.warn = realWarn;
    }
    return warnings;
  };

  await t.test('two formats of the same id warn once', async () => {
    const warnings = await warningsFor({
      [DASHED]: { title: 'from the API' },
      [COMPACT]: { title: 'from the URL bar' },
    });
    assert.equal(warnings.length, 1, `expected one warning, got ${warnings.length}`);
    assert.match(warnings[0], /Duplicate pageMetadata/);
    assert.match(warnings[0], new RegExp(COMPACT));
  });

  await t.test('the later entry still wins, so behaviour is unchanged', async () => {
    const warnings = await warningsFor({ [DASHED]: { title: 'first' }, [COMPACT]: { title: 'second' } });
    assert.equal(warnings.length, 1);
  });

  await t.test('distinct pages do not warn', async () => {
    assert.deepEqual(await warningsFor({ [COMPACT]: { title: 'a' }, ['2'.repeat(32)]: { title: 'b' } }), []);
  });
});

test('config mistakes are reported rather than absorbed', { skip }, async (t) => {
  /** Captures the warnings emitted while the config is processed. */
  const warningsFor = async (config) => {
    const warnings = [];
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = (...args) => warnings.push(args.join(' '));
    console.error = () => {};
    try {
      const proxy = createProxy(config);
      await proxy.fetch('https://example.com/');
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
    return warnings;
  };

  await t.test('two slugs pointing at one page are reported', async () => {
    // A reasonable thing to configure — "/" and "/home" — but only one can be the
    // reverse mapping, and that one decides the canonical URL and what the address
    // bar rewrites to. Choosing silently made it look arbitrary.
    const warnings = await warningsFor(baseConfig({ slugToPage: { '/': PAGE.home, '/home': PAGE.home } }));
    assert.ok(
      warnings.some((line) => line.includes('Two slugs map to the same page')),
      `no warning for a duplicated page id: ${warnings.join(' | ')}`,
    );
  });

  await t.test('a slug without a leading slash is reported', async () => {
    // It is matched against a request pathname, which always starts with "/", so
    // it can never match. Nothing said so, and the page just 404'd.
    const warnings = await warningsFor(baseConfig({ slugToPage: { '/': PAGE.home, about: PAGE.about } }));
    assert.ok(
      warnings.some((line) => line.includes('does not start with')),
      `no warning for a slug missing its leading slash: ${warnings.join(' | ')}`,
    );
  });

  await t.test('a well-formed config warns about nothing', async () => {
    const warnings = await warningsFor(baseConfig());
    assert.deepEqual(warnings, [], 'a valid config produced warnings');
  });
});
