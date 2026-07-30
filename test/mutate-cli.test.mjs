// The mutation harness is what certifies the rest of this suite, so a silent
// failure in its argument handling quietly weakens every other guarantee here.
//
// It had one. `--shard=` produced an empty string and `--shard` produced
// undefined; both are falsy, so the shard branch was skipped and the run
// covered every mutation instead of a twelfth of them. Nothing failed. Locally
// that is a 27 minute run when you asked for a 27 second one, and in CI it is
// twelve jobs each doing the whole thing until the timeout kills them, which
// reports as a timeout rather than a bad argument.
//
// Only the paths that exit before anything is written are exercised below. A
// shard that actually selects mutations rewrites source files and runs a build
// per mutation, which is not something a test should set off.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'mutate.mjs');

/**
 * Every call below should reject its argument and exit in milliseconds.
 *
 * The regression this file guards against turns each of them into a full
 * mutation run instead, minutes long. `node:test` has no default timeout, so
 * without this the suite would sit there until CI killed the job and blamed a
 * timeout rather than the assertion. That is not hypothetical: it is what
 * happened while proving these tests actually fail on the bug.
 */
const TIMEOUT_MS = 15_000;

function run(args) {
  try {
    const options = { encoding: 'utf8', stdio: 'pipe', timeout: TIMEOUT_MS };
    return { code: 0, output: execFileSync(process.execPath, [SCRIPT, ...args], options) };
  } catch (error) {
    if (error.killed) {
      throw new Error(
        `mutate.mjs did not exit within ${TIMEOUT_MS}ms for ${JSON.stringify(args)}. It is most likely running mutations instead of rejecting the argument.`,
      );
    }
    return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('a malformed --shard is rejected rather than silently running everything', async (t) => {
  // Each of these used to fall through to a full run.
  for (const arg of ['--shard=', '--shard', '--shards=1/12', '--shard=1.9/12', '--shard=x/12', '--shard=1/']) {
    await t.test(JSON.stringify(arg), () => {
      const { code, output } = run([arg]);
      assert.equal(code, 1, `${arg} should exit 1`);
      assert.match(output, /Expected --shard=i\/n/);
    });
  }
});

test('--shard with a space is caught before the name filter sees it', () => {
  // Arrives as two arguments. Validating after the filter meant the second one
  // was read as a mutation name and the error said "No mutation matches 1/12",
  // which points at the wrong argument.
  const { code, output } = run(['--shard', '1/12']);

  assert.equal(code, 1);
  assert.match(output, /Expected --shard=i\/n/);
  assert.doesNotMatch(output, /No mutation matches/);
});

test('a shard index outside its range is rejected', async (t) => {
  for (const arg of ['--shard=0/12', '--shard=13/12', '--shard=1/0']) {
    await t.test(arg, () => {
      const { code, output } = run([arg]);
      assert.equal(code, 1, `${arg} should exit 1`);
      assert.match(output, /1 <= i <= n/);
    });
  }
});

test('a valid shard with nothing left to do exits cleanly', () => {
  // More shards than mutations is wasteful, not wrong. Failing here would turn
  // a matrix that overshoots into a red build for no reason.
  const { code, output } = run(['--shard=999/999']);

  assert.equal(code, 0);
  assert.match(output, /nothing to do/);
});

test('an unmatched name filter still reports the filter', () => {
  // The shard check runs first now, so it must not swallow this case.
  const { code, output } = run(['definitelynotamutationname']);

  assert.equal(code, 1);
  assert.match(output, /No mutation matches/);
});
