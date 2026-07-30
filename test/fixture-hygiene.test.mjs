// Nothing in the test suite may carry real data.
//
// Fixtures get captured from live sites because that is what makes them worth
// having, and a capture brings along whatever identifiers the page contained:
// page ids, workspace hostnames, telemetry tokens. Those belong to whoever ran
// the capture, and this is a public repository.
//
// So every identifier-shaped string in test/ and scripts/ has to appear in the
// allowlist below. Adding one is a deliberate act with a reason written next to
// it; a fresh capture that drags in a real page id fails here and names it,
// rather than being noticed by a person reading 18KB of minified HTML.
//
// The allowlist holds only invented values, so this file adds no real data of
// its own — which is also why the check is structural and never greps for
// anyone's name.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from './helpers/generated.mjs';

/** Invented values, with the reason each one exists. */
const ALLOWED = {
  ids: {
    '11111111111111111111111111111111': 'harness PAGE.home',
    '22222222222222222222222222222222': 'harness PAGE.about',
    '33333333333333333333333333333333': 'harness PAGE.nested',
    '44444444444444444444444444444444': 'head-js test: a second mapped page',
    '55555555555555555555555555555555': 'head-js test: a third mapped page',
    '99999999999999999999999999999999': 'an id deliberately absent from every config',
    abc123def4567890abc123def4567890: 'config normalization: the canonical form',
    ABC123DEF4567890ABC123DEF4567890: 'config normalization: the uppercase form',
  },
  uuids: {
    '22222222-2222-2222-2222-222222222222': "the fixture's page id, replaced with harness PAGE.about",
    '00000000-0000-0000-0000-000000000000': 'a telemetry token in the captured bundle, zeroed out',
    'abc123de-f456-7890-abc1-23def4567890': 'config normalization: the dashed form',
  },
  emails: {
    'p@h.com': 'minify test: a URL with credentials in the authority',
    'pw@evil.com': 'SSRF test: credentials in the authority',
  },
  hosts: {
    'space.notion.site': 'the invented Notion domain used across the suite',
    'app.notion.com': "Notion's own generic host, present in the captured shell",
    'www.notion.so': "Notion's public host, in a cookie re-scoping case",
    'exp.notion.so': "Notion's experiment endpoint, in a /200 passthrough case",
    'xspace.notion.site': 'SSRF test: a lookalike host that must not be accepted',
    'a.notion.site': 'multi-tenant test: the first invented tenant',
    'b.notion.site': 'multi-tenant test: the second invented tenant',
  },
};

const PATTERNS = {
  ids: /\b[a-fA-F0-9]{32}\b/g,
  uuids: /\b[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\b/g,
  emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  hosts: /\b[a-z0-9-]+\.notion\.(?:site|so|com)\b/g,
};

const LABELS = {
  ids: 'page id',
  uuids: 'UUID',
  emails: 'email address',
  hosts: 'Notion hostname',
};

function textFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) {
    return found;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...textFiles(full));
    } else if (/\.(mjs|js|ts|html|css|json|md)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const FILES = [...textFiles(path.join(ROOT, 'test')), ...textFiles(path.join(ROOT, 'scripts'))];

test('the test suite carries no real data', async (t) => {
  await t.test('there are files to check', () => {
    // A path change that silently emptied this list would make every assertion
    // below vacuously true.
    assert.ok(FILES.length >= 20, `only found ${FILES.length} files to scan`);
    // Compared with path.sep: these come from path.join, so on Windows the
    // separator is a backslash and a hardcoded '/' would never match — the
    // guard would report the fixture as unscanned.
    const fixture = path.join('fixtures', 'notion-page.html');
    assert.ok(
      FILES.some((file) => file.endsWith(fixture)),
      'the captured fixture is not being scanned',
    );
  });

  for (const [kind, pattern] of Object.entries(PATTERNS)) {
    await t.test(`every ${LABELS[kind]} is an invented one`, () => {
      const unexpected = new Map();

      for (const file of FILES) {
        for (const match of fs.readFileSync(file, 'utf8').match(pattern) ?? []) {
          if (!(match in ALLOWED[kind])) {
            unexpected.set(match, path.relative(ROOT, file));
          }
        }
      }

      const listed = [...unexpected].map(([value, file]) => `  ${value}  (${file})`).join('\n');

      assert.deepEqual(
        [...unexpected],
        [],
        `unrecognised ${LABELS[kind]}(s) found. If these are invented, add them to ALLOWED.${kind} with a reason. If they came from a real site, replace them:\n${listed}`,
      );
    });
  }

  await t.test('no Authorization header carries a live-looking token', () => {
    // A captured bundle can embed one of these, and a credential-shaped string
    // does not belong in a public repository whoever it belongs to.
    for (const file of FILES) {
      for (const match of fs.readFileSync(file, 'utf8').match(/Authorization:\s*"[^"]*"/gi) ?? []) {
        assert.match(
          match,
          /0{8}-0{4}-0{4}-0{4}-0{12}|"\s*"/,
          `${path.relative(ROOT, file)} contains a token: ${match}`,
        );
      }
    }
  });

  await t.test('no fixture points at a personal workspace subdomain', () => {
    // A Notion workspace address identifies its owner. The suite's own
    // space.notion.site is invented; anything else came from a real capture.
    const fixtures = FILES.filter((file) => file.includes(`${path.sep}fixtures${path.sep}`));
    assert.ok(fixtures.length > 0, 'no fixtures were found to check');

    for (const file of fixtures) {
      for (const host of fs.readFileSync(file, 'utf8').match(PATTERNS.hosts) ?? []) {
        assert.ok(host in ALLOWED.hosts, `${path.relative(ROOT, file)} references ${host}`);
      }
    }
  });
});
