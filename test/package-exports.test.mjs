// The package's public surface: what `import { ... } from 'nooxy'` resolves to,
// and what the shipped type declarations promise.
//
// These are the only things a consumer can depend on. A change here breaks
// installs rather than pages, and nothing else in the suite would notice.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readSource, ROOT } from './helpers/generated.mjs';

const pkg = JSON.parse(readSource('package.json'));
const DIST = path.join(ROOT, 'dist/index.js');
const TYPES = path.join(ROOT, 'dist/index.d.ts');
const missingBuild = fs.existsSync(DIST) ? false : 'run `pnpm build` first';

// A skipped suite still reports green, so in CI a missing build has to be a hard
// failure rather than a quiet skip. See the same guard in harness.mjs.
if (missingBuild && process.env.CI) {
  throw new Error(`Refusing to report a pass without a current build: ${missingBuild}`);
}

const skip = missingBuild;

// CI is Linux only, deliberately. But contributors are not, and every script here
// is something they run locally — so a Unix-only construct in one is a wall that
// nothing in CI would ever report. Checked statically, because that is the only way
// to check it from Linux.
test('every package script can run on Windows too', async (t) => {
  const scripts = Object.entries(pkg.scripts ?? {});

  await t.test('there are scripts to check', () => {
    // A rename that emptied this list would make everything below vacuous.
    assert.ok(scripts.length >= 10, `only found ${scripts.length} scripts`);
  });

  const HAZARDS = [
    // pnpm runs scripts through cmd.exe on Windows, which has none of these.
    [/(?:^|\s|&|\|)(rm|cp|mv|mkdir|sed|grep|cat|touch|which|true|false)\s/, 'a Unix-only command'],
    [/\|\|\s*true\b/, '`|| true`, which cmd.exe cannot run — use a node -e fallback'],
    [/\$\{?[A-Za-z_]/, 'Unix $VAR expansion — cmd.exe uses %VAR%'],
    [/(?:^|\s)export\s/, '`export`, which cmd.exe does not have'],
  ];

  for (const [name, command] of scripts) {
    await t.test(name, () => {
      for (const [pattern, why] of HAZARDS) {
        assert.ok(!pattern.test(command), `"${name}" uses ${why}:\n  ${command}`);
      }
    });
  }
});

test('package manifest points at files that exist', { skip }, async (t) => {
  for (const field of ['main', 'module', 'types']) {
    await t.test(`${field} resolves`, () => {
      assert.ok(pkg[field], `package.json has no ${field}`);
      assert.ok(fs.existsSync(path.join(ROOT, pkg[field])), `${field} points at a missing file: ${pkg[field]}`);
    });
  }

  await t.test('the bin entry resolves and is executable by node', () => {
    const bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
    assert.ok(bin, 'package.json has no bin entry');
    const binPath = path.join(ROOT, bin);
    assert.ok(fs.existsSync(binPath), `bin points at a missing file: ${bin}`);
    assert.match(fs.readFileSync(binPath, 'utf8'), /^#!/, 'the bin entry has no shebang');
  });

  await t.test('the exports map agrees with main and types', () => {
    const entry = pkg.exports?.['.'];
    assert.ok(entry, 'package.json has no "." export');
    assert.equal(path.normalize(entry.default), path.normalize(`./${pkg.main}`.replace('././', './')));
    assert.equal(path.normalize(entry.types), path.normalize(`./${pkg.types}`.replace('././', './')));
  });

  await t.test('the files allowlist covers everything the entry points need', () => {
    const patterns = pkg.files ?? [];
    assert.ok(
      patterns.some((p) => p.includes('dist')),
      'dist is not included in the published files',
    );
    for (const required of ['README.md', 'LICENSE']) {
      assert.ok(patterns.includes(required), `${required} is not published`);
    }
  });
});

test('the runtime entry point exports what consumers import', { skip }, async (t) => {
  const moduleExports = await import(DIST);

  await t.test('initializeNooxy is exported as a function', () => {
    assert.equal(typeof moduleExports.initializeNooxy, 'function');
  });

  await t.test('it returns a request handler', () => {
    const handler = moduleExports.initializeNooxy({
      domain: 'example.com',
      notionDomain: 'space.notion.site',
      siteName: 'S',
      slugToPage: { '/': '11111111111111111111111111111111' },
      customHeadCSS: '',
      customHeadJS: '',
      customBodyJS: '',
      customHeader: '',
    });
    assert.equal(typeof handler, 'function');
    assert.equal(handler.length, 1, 'the handler should take a single Request');
  });

  await t.test('no internal helpers leak into the public surface', () => {
    // Only the documented entry point is public; everything else is free to
    // change without a major version.
    const leaked = Object.keys(moduleExports).filter((name) => name !== 'initializeNooxy' && name !== 'default');
    assert.deepEqual(leaked, [], `unexpected public exports: ${leaked.join(', ')}`);
  });
});

test('the shipped type declarations are usable', { skip }, async (t) => {
  const declarations = fs.readFileSync(TYPES, 'utf8');

  await t.test('initializeNooxy is declared', () => {
    assert.match(declarations, /declare function initializeNooxy/);
    assert.match(declarations, /export \{[^}]*initializeNooxy/s);
  });

  // The config type is what gives users autocomplete in their nooxy/config.js.
  const CONFIG_FIELDS = [
    'domain',
    'slugToPage',
    'siteName',
    'notionDomain',
    'pageMetadata',
    'twitterHandle',
    'siteIcon',
    'fof',
    'subDomains',
    'googleFont',
    'googleTagID',
    'seo',
    'nooxy',
    'customHeadCSS',
    'customHeadJS',
    'customBodyJS',
    'customHeader',
  ];

  for (const field of CONFIG_FIELDS) {
    await t.test(`NooxySiteConfig still declares ${field}`, () => {
      assert.match(declarations, new RegExp(`\\b${field}\\??:`), `${field} vanished from the public type`);
    });
  }

  await t.test('the public config type is exported by name', () => {
    for (const name of ['NooxySiteConfig', 'NooxySeoConfig', 'NooxySiteConfigPageMetadata']) {
      assert.ok(declarations.includes(name), `${name} is not in the published declarations`);
    }
  });

  await t.test('the derived fields stay off the user-facing type', () => {
    // slugs and pageToSlug are computed by ConfigManager; requiring them would
    // make every hand-written config a type error.
    assert.match(declarations, /Omit<NooxySiteConfigFull, 'slugs' \| 'pageToSlug'>/);
  });
});
