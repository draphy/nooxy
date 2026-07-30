// What the mutation harness prints when its baseline fails.
//
// It used to print the last fifteen lines. Node's test runner emits TAP when
// stdout is not a TTY, so the failures are `not ok N - name` lines partway
// through the stream and the tail lands on the trailing counters. A real CI run
// reported `# fail 1` and named nothing, which left a flaky test unidentifiable
// and its output unrecoverable.
//
// These cases pin the shapes that mattered: both reporters, a build error with
// no test lines at all, and two failures that share a name.

import assert from 'node:assert/strict';
import test from 'node:test';
import { excerpt } from '../scripts/lib/excerpt.mjs';

const TAP = `
TAP version 13
ok 1 - a passing one
not ok 2 - the flaky one
  ---
  error: 'Expected values to be strictly equal'
  ...
ok 3 - another passing one
1..3
# tests 3
# pass 2
# fail 1
`;

// The spec reporter prints each failure twice: once inline, once under a
// heading at the end.
const SPEC = `
✔ a passing one (0.5ms)
✖ the flaky one (1.2ms)
✔ another passing one (0.3ms)
ℹ tests 3
ℹ pass 2
ℹ fail 1

✖ failing tests:

✖ the flaky one (1.2ms)
`;

test('TAP output yields the failing test name', () => {
  const out = excerpt(TAP);

  assert.match(out, /not ok 2 - the flaky one/);
  assert.match(out, /# fail 1/, 'the counters are kept so names can be checked against the total');
  assert.doesNotMatch(out, /ok 1 - a passing one/, 'passing tests are noise here');
});

test('spec output yields the failing test name, once', () => {
  const out = excerpt(SPEC);
  const named = out.split('\n').filter((line) => line.startsWith('✖'));

  assert.deepEqual(named, ['✖ the flaky one (1.2ms)'], 'printed twice by the reporter, reported once');
  assert.doesNotMatch(out, /failing tests:/, 'the heading is not a test');
  assert.match(out, /ℹ fail 1/);
});

test('two failures sharing a name are both reported', () => {
  // Deduping must not merge genuinely different failures. TAP numbers them.
  const out = excerpt('not ok 1 - duplicate name\nnot ok 2 - duplicate name\n# fail 2');

  assert.match(out, /not ok 1 - duplicate name/);
  assert.match(out, /not ok 2 - duplicate name/);
});

test('output with no test lines falls back to the tail', () => {
  // A build error. tsup marks these with ✘ (U+2718), which is deliberately not
  // the ✖ (U+2716) the test runner uses, so it must not be read as a failure.
  const out = excerpt('line one\nline two\n✘ [ERROR] Unexpected ")"\n  src/proxy.ts:251:5');

  assert.match(out, /Unexpected/);
  assert.match(out, /line one/, 'the whole tail is shown, not just the marked line');
});

test('the tail length is bounded', () => {
  const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');

  assert.equal(excerpt(long).split('\n').length, 15);
  assert.equal(excerpt(long, 3).split('\n').length, 3);
});

test('a long failure list is truncated with a count', () => {
  const many = Array.from({ length: 25 }, (_, i) => `not ok ${i + 1} - failure ${i + 1}`).join('\n');
  const out = excerpt(many);

  assert.match(out, /\.\.\. and 5 more/);
  assert.equal(out.split('\n').filter((line) => line.startsWith('not ok')).length, 20);
});

test('empty and missing output do not throw', () => {
  assert.equal(excerpt(''), '');
  assert.equal(excerpt(undefined), '');
  assert.equal(excerpt(null), '');
});
