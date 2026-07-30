// The injected script in a real browser.
//
// head-js.test.mjs runs the same code in a vm sandbox with hand-built stubs for
// location and history. That proves the translation logic, but it cannot prove
// the part users actually see: that overriding history.pushState takes effect,
// that the rewritten URL is accepted by a real same-origin check, and that the
// address bar ends up showing the slug.
//
// This file serves the genuine proxy output — the real Notion fixture, put
// through the real rewriters — to a real Chrome, then drives the History API
// exactly as Notion's bundle does.
//
// The reported symptom was: "On load, the slug appears after the domain for a
// short time then disappears", i.e. the address bar settled on a 32-character
// page id instead of the slug. The pushState assertions below are that bug.
//
// Skips cleanly when no Chrome is installed; set NOOXY_CHROME to point at one.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { cleanUpProfiles, skipWithoutChrome, withPage } from './helpers/browser.mjs';
import { ROOT } from './helpers/generated.mjs';
import { baseConfig, createProxy, PAGE, skip } from './helpers/harness.mjs';

const skipReason = skip || skipWithoutChrome;
const NOTION_PAGE = fs.readFileSync(path.join(ROOT, 'test/fixtures/notion-page.html'), 'utf8');

/**
 * The bytes a visitor actually receives for `slug`.
 *
 * The slug has to exist in the config being used, or the proxy answers with a
 * 404 and the browser gets a page with no injected script at all — which fails
 * as a confusing "window.nooxy is undefined" rather than as a routing problem.
 */
async function proxiedPage(config = baseConfig(), slug = '/about') {
  const proxy = createProxy(config, () => new Response(NOTION_PAGE, { headers: { 'content-type': 'text/html' } }));
  const response = await proxy.fetch(`https://example.com${slug}`);
  assert.equal(response.status, 200, `the proxy did not serve ${slug} (status ${response.status})`);
  return response.text();
}

/** Wraps an expression so a thrown SecurityError is reported, not swallowed. */
const guarded = (body) => `(function(){ try { ${body} } catch (e) { return 'THREW: ' + e.message } })()`;

test('the injected script installs itself in a real browser', { skip: skipReason }, async (t) => {
  const html = await proxiedPage();

  await withPage(html, async (evaluate) => {
    await t.test('window.nooxy exists', async () => {
      assert.equal(await evaluate('typeof window.nooxy'), 'object');
    });

    await t.test('the document still parses around the injected script', async () => {
      // A mangled injection would break the head and take the rest with it.
      assert.equal(await evaluate('document.body.querySelector("#initial-loading-spinner") !== null'), true);
      assert.equal(await evaluate('document.querySelectorAll("head").length'), 1);
    });

    await t.test('href() reports the Notion-space URL the bundle expects', async () => {
      // The bundle's own window.location.href reads are patched to call this.
      const href = await evaluate(guarded('return window.nooxy.href()'));
      assert.match(href, /^https:\/\/space\.notion\.site\//, `unexpected href(): ${href}`);
    });
  });
});

test('the address bar shows slugs, not page ids', { skip: skipReason }, async (t) => {
  const html = await proxiedPage();

  await withPage(html, async (evaluate) => {
    await t.test('pushState to a Notion page id lands on the slug', async () => {
      // This is the reported bug. Notion's bundle navigates by page id; without
      // the translation the address bar is left showing 32 hex characters.
      const pathname = await evaluate(
        guarded(`history.pushState({}, '', 'https://space.notion.site/${PAGE.about}'); return location.pathname;`),
      );
      assert.equal(pathname, '/about', `the page id survived in the address bar: ${pathname}`);
    });

    await t.test('replaceState translates too, keeping the query and hash', async () => {
      const url = await evaluate(
        guarded(
          `history.replaceState({}, '', 'https://space.notion.site/${PAGE.nested}?x=1#section');
           return location.pathname + location.search + location.hash;`,
        ),
      );
      assert.equal(url, '/docs/getting-started?x=1#section');
    });

    await t.test('a bare page id path is translated as well', async () => {
      const pathname = await evaluate(guarded(`history.pushState({}, '', '/${PAGE.home}'); return location.pathname;`));
      assert.equal(pathname, '/');
    });

    await t.test('an unmapped page id is left alone rather than guessed at', async () => {
      const unmapped = '9'.repeat(32);
      const pathname = await evaluate(guarded(`history.pushState({}, '', '/${unmapped}'); return location.pathname;`));
      assert.equal(pathname, `/${unmapped}`);
    });

    await t.test('a URL that is already in your-space is untouched', async () => {
      const pathname = await evaluate(guarded("history.pushState({}, '', '/about'); return location.pathname;"));
      assert.equal(pathname, '/about');
    });

    await t.test('no navigation was rejected as cross-origin', async () => {
      // Translation has to produce a same-origin URL. If it ever emitted the
      // notion.site URL unchanged, pushState would throw a SecurityError — the
      // guarded() wrapper above would surface it as a THREW: string.
      const result = await evaluate(
        guarded(`history.pushState({}, '', 'https://space.notion.site/${PAGE.about}'); return 'ok';`),
      );
      assert.equal(result, 'ok');
    });
  });
});

test('URL translation runs both ways in the browser', { skip: skipReason }, async (t) => {
  const html = await proxiedPage();

  await withPage(html, async (evaluate) => {
    await t.test('_myUrl maps a slug to its page id for outgoing requests', async () => {
      assert.equal(await evaluate(guarded('return window.nooxy._myUrl("/about")')), `/${PAGE.about}`);
    });

    await t.test('_yourUrl maps a page id back to its slug', async () => {
      const result = await evaluate(guarded(`return window.nooxy._yourUrl('/${PAGE.about}')`));
      assert.match(result, /\/about$/, `not translated back: ${result}`);
    });

    await t.test('a round trip returns the original path', async () => {
      const result = await evaluate(guarded('return window.nooxy._yourUrl(window.nooxy._myUrl("/about"))'));
      assert.match(result, /\/about$/, `round trip lost the slug: ${result}`);
    });
  });
});

test('slugs containing regex metacharacters do not break the browser script', { skip: skipReason }, async (t) => {
  // '/c++' compiles to an invalid pattern if a slug is concatenated into a
  // RegExp without escaping, which would throw on every navigation.
  const config = baseConfig({
    slugToPage: { '/': PAGE.home, '/c++': PAGE.about, '/a.b': PAGE.nested },
  });
  const html = await proxiedPage(config, '/');

  await withPage(html, async (evaluate) => {
    await t.test('the script still initialises', async () => {
      assert.equal(await evaluate('typeof window.nooxy'), 'object');
    });

    for (const [slug, page] of [
      ['/c++', PAGE.about],
      ['/a.b', PAGE.nested],
    ]) {
      await t.test(`${slug} translates without throwing`, async () => {
        assert.equal(await evaluate(guarded(`return window.nooxy._myUrl(${JSON.stringify(slug)})`)), `/${page}`);
        const back = await evaluate(guarded(`history.pushState({}, '', '/${page}'); return location.pathname;`));
        assert.equal(back, slug, `page id did not resolve back to ${slug}: ${back}`);
      });
    }

    await t.test('a dot in a slug is not treated as a wildcard', async () => {
      // '/a.b' as an unescaped pattern would also match '/axb'.
      const result = await evaluate(guarded('return window.nooxy._myUrl("/axb")'));
      assert.equal(result, '/axb', `the dot matched as a wildcard: ${result}`);
    });
  });
});

// Chrome children can recreate a profile directory just after it is deleted,
// so the guaranteed sweep happens here, once every browser has exited.
test.after(cleanUpProfiles);
