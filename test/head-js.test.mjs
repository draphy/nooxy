// Tests for the browser-side URL translator in src/rewriters/custom/head.js.
//
// Every case runs twice: once against the source file and once against the
// minified string in generated/_head-js-string.ts that actually ships. Both are
// evaluated in a vm sandbox with the same variable prefix that
// data-rewriter.ts injects, so these exercise the real production path.
//
//   node --test test/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { GENERATED, readGeneratedConstant, ROOT, SOURCE } from './helpers/generated.mjs';

const SOURCE_PATH = path.join(ROOT, SOURCE.headJs);

const DOMAIN = 'example.com';
const NOTION_DOMAIN = 'space.notion.site';
const ORIGIN = `https://${DOMAIN}`;
const NOTION_ORIGIN = `https://${NOTION_DOMAIN}`;

const HOME = '11111111111111111111111111111111';
const ABOUT = '22222222222222222222222222222222';
const NESTED = '33333333333333333333333333333333';
const DOTTED = '44444444444444444444444444444444';
const PLUSES = '55555555555555555555555555555555';
const UNMAPPED = '99999999999999999999999999999999';

const SLUG_TO_PAGE = {
  '/': HOME,
  '/about': ABOUT,
  '/docs/getting-started': NESTED,
  '/v1.0': DOTTED, // '.' is a regex metacharacter
  '/c++': PLUSES, // '+' throws "nothing to repeat" if unescaped
};

/** Evaluate head.js in a browser-shaped sandbox, exactly as the proxy injects it. */
function createSandbox(headJs) {
  const pageToSlug = {};
  for (const slug of Object.keys(SLUG_TO_PAGE)) {
    pageToSlug[SLUG_TO_PAGE[slug]] = slug;
  }

  const written = [];
  const location = { origin: ORIGIN, href: `${ORIGIN}/` };
  const win = {
    location,
    addEventListener() {},
    fetch: () => Promise.resolve(),
    history: {
      pushState(_state, _title, url) {
        written.push({ fn: 'pushState', url });
      },
      replaceState(_state, _title, url) {
        written.push({ fn: 'replaceState', url });
      },
    },
  };

  const ctx = {
    window: win,
    location,
    URL,
    console,
    document: { body: {}, querySelector: () => null, addEventListener() {} },
    MutationObserver: class {
      observe() {}
    },
    requestAnimationFrame: (cb) => cb(),
    XMLHttpRequest: function XMLHttpRequest() {
      this.open = () => {};
    },
    Response: class {
      constructor(body, init) {
        this.body = body;
        Object.assign(this, init);
      }
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // Mirrors the variable prefix built in src/rewriters/data-rewriter.ts
  const prefix = `var notionDomain='${NOTION_ORIGIN}',slugToPage=${JSON.stringify(SLUG_TO_PAGE)},pageToSlug=${JSON.stringify(pageToSlug)},customHeader='',showBadge=false;`;
  vm.runInContext(prefix + headJs, ctx);

  return { nooxy: win.nooxy, history: win.history, written };
}

const BUILDS = [
  ['source head.js', createSandbox(fs.readFileSync(SOURCE_PATH, 'utf8'))],
  ['generated (shipped, minified)', createSandbox(readGeneratedConstant(GENERATED.headJs))],
];

// ---------------------------------------------------------------------------
// Notion-space -> your-space. This is the direction that was broken.
// ---------------------------------------------------------------------------
const YOUR_URL_CASES = [
  // [description, input, expected]
  ['bare page id, absolute notion url (the regressed case)', `${NOTION_ORIGIN}/${HOME}`, `${ORIGIN}/`],
  ['bare page id, absolute own-domain url', `${ORIGIN}/${HOME}`, `${ORIGIN}/`],
  ['bare page id, relative', `/${HOME}`, '/'],
  ['title-prefixed id, relative', `/Home-${HOME}`, '/'],
  ['title-prefixed id, absolute', `${ORIGIN}/Home-${HOME}`, `${ORIGIN}/`],
  ['non-root slug, bare id', `/${ABOUT}`, '/about'],
  ['non-root slug, title-prefixed', `/About-Us-${ABOUT}`, '/about'],
  ['nested slug, bare id', `/${NESTED}`, '/docs/getting-started'],
  ['nested slug, title-prefixed', `/Getting-Started-${NESTED}`, '/docs/getting-started'],
  ['trailing slash after id', `/${HOME}/`, '/'],
  ['query string preserved', `/${HOME}?v=abc`, '/?v=abc'],
  ['query string preserved, title-prefixed', `/Home-${HOME}?pvs=4`, '/?pvs=4'],
  ['hash preserved', `/Home-${HOME}#block-1`, '/#block-1'],
  ['query and hash preserved', `/${HOME}?v=1#b`, '/?v=1#b'],
  ['query and hash, absolute', `${NOTION_ORIGIN}/${HOME}?v=1#b`, `${ORIGIN}/?v=1#b`],
  ['non-standard port preserved', `http://localhost:8787/${HOME}`, 'http://localhost:8787/'],
  ['page not in slugToPage falls through', `/${UNMAPPED}`, `/${UNMAPPED}`],
  ['url with no page id falls through', '/login', '/login'],
  ['already translated url is idempotent', '/about', '/about'],
  ['root path falls through', '/', '/'],
];

for (const [label, sandbox] of BUILDS) {
  test(`_yourUrl — ${label}`, async (t) => {
    for (const [desc, input, expected] of YOUR_URL_CASES) {
      await t.test(desc, () => {
        assert.equal(sandbox.nooxy._yourUrl(input), expected);
      });
    }

    await t.test('omitted url argument does not throw', () => {
      assert.equal(sandbox.nooxy._yourUrl(undefined), undefined);
      assert.equal(sandbox.nooxy._yourUrl(null), null);
    });
  });
}

// ---------------------------------------------------------------------------
// your-space -> Notion-space. Must keep working unchanged.
// ---------------------------------------------------------------------------
const MY_URL_CASES = [
  ['root', `${ORIGIN}/`, `${NOTION_ORIGIN}/${HOME}`],
  ['simple slug', `${ORIGIN}/about`, `${NOTION_ORIGIN}/${ABOUT}`],
  ['nested slug', `${ORIGIN}/docs/getting-started`, `${NOTION_ORIGIN}/${NESTED}`],
  ['slug containing a dot', `${ORIGIN}/v1.0`, `${NOTION_ORIGIN}/${DOTTED}`],
  ['slug containing plus signs', `${ORIGIN}/c++`, `${NOTION_ORIGIN}/${PLUSES}`],
  ['slug with hash', `${ORIGIN}/about#sec`, `${NOTION_ORIGIN}/${ABOUT}#sec`],
  ['slug with query', `${ORIGIN}/about?x=1`, `${NOTION_ORIGIN}/${ABOUT}?x=1`],
  ['unmapped slug falls through', `${ORIGIN}/nope`, `${NOTION_ORIGIN}/nope`],
];

for (const [label, sandbox] of BUILDS) {
  test(`_myUrl — ${label}`, async (t) => {
    for (const [desc, input, expected] of MY_URL_CASES) {
      await t.test(desc, () => {
        assert.equal(sandbox.nooxy._myUrl(input), expected);
      });
    }

    await t.test('omitted url argument does not throw', () => {
      assert.equal(sandbox.nooxy._myUrl(undefined), undefined);
    });

    await t.test('href() reports Notion-space for the current location', () => {
      assert.equal(sandbox.nooxy.href(), `${NOTION_ORIGIN}/${HOME}`);
    });
  });
}

// ---------------------------------------------------------------------------
// The two must be inverses — this is the invariant the bug violated.
// ---------------------------------------------------------------------------
for (const [label, sandbox] of BUILDS) {
  test(`round trip — ${label}`, async (t) => {
    for (const slug of Object.keys(SLUG_TO_PAGE)) {
      await t.test(`${slug} survives your -> notion -> your`, () => {
        const notionSide = sandbox.nooxy._myUrl(ORIGIN + slug);
        assert.equal(sandbox.nooxy._yourUrl(notionSide), ORIGIN + slug);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// End to end through the patched History API, mimicking Notion's boot sequence.
// ---------------------------------------------------------------------------
for (const [label, sandbox] of BUILDS) {
  test(`history traps — ${label}`, async (t) => {
    await t.test('replaceState translates before reaching the real API', () => {
      sandbox.written.length = 0;
      sandbox.history.replaceState(null, '', `${NOTION_ORIGIN}/${HOME}`);
      assert.deepEqual(sandbox.written, [{ fn: 'replaceState', url: `${ORIGIN}/` }]);
    });

    await t.test('pushState translates before reaching the real API', () => {
      sandbox.written.length = 0;
      sandbox.history.pushState(null, '', `/About-Us-${ABOUT}`);
      assert.deepEqual(sandbox.written, [{ fn: 'pushState', url: '/about' }]);
    });

    await t.test("Notion's two writes both land on the slug, so no page id is ever shown", () => {
      sandbox.written.length = 0;
      // 1. boot: Notion knows only the page id
      sandbox.history.replaceState(null, '', `${NOTION_ORIGIN}/${HOME}`);
      // 2. once the page record loads it re-normalises with the title
      sandbox.history.replaceState(null, '', `/Home-${HOME}`);
      assert.deepEqual(
        sandbox.written.map((w) => w.url),
        [`${ORIGIN}/`, '/'],
      );
      for (const write of sandbox.written) {
        assert.ok(!write.url.includes(HOME), `page id leaked into the address bar: ${write.url}`);
      }
    });

    await t.test('omitted url argument is passed through untouched', () => {
      sandbox.written.length = 0;
      sandbox.history.replaceState({ a: 1 }, '');
      assert.deepEqual(sandbox.written, [{ fn: 'replaceState', url: undefined }]);
    });
  });
}

// ---------------------------------------------------------------------------
// The shipped bundle must behave identically to the source it was built from.
// ---------------------------------------------------------------------------
test('generated bundle matches source behaviour', async (t) => {
  const [, source] = BUILDS[0];
  const [, generated] = BUILDS[1];
  const inputs = [...YOUR_URL_CASES.map(([, input]) => input), ...MY_URL_CASES.map(([, input]) => input)];

  await t.test('_yourUrl agrees on every case', () => {
    for (const input of inputs) {
      assert.equal(generated.nooxy._yourUrl(input), source.nooxy._yourUrl(input), `differs for ${input}`);
    }
  });

  await t.test('_myUrl agrees on every case', () => {
    for (const input of inputs) {
      assert.equal(generated.nooxy._myUrl(input), source.nooxy._myUrl(input), `differs for ${input}`);
    }
  });

  await t.test('generated file is up to date with head.js', () => {
    // Guards against committing head.js edits without running the converter.
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');
    const shipped = readGeneratedConstant(GENERATED.headJs);
    for (const fn of ['_myUrl', '_yourUrl', 'splitUrlTail', 'originOf', 'escapeRegExp', 'extractPageId']) {
      assert.ok(source.includes(fn), `${fn} missing from head.js`);
      assert.ok(shipped.includes(fn), `${fn} missing from the generated bundle — run: node converter.js`);
    }
  });
});
