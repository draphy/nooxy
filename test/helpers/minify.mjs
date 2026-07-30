// Shared setup for the minifier test files.
//
// All of them need the same two things: run source through the real minifyFile
// pipeline, and read the string back out of the generated TypeScript module.
// (minifyFile used to call process.exit on failure, which this helper had to
// work around; it throws now, so there is nothing to trap. See quietBuild.)
//
// This is not a *.test.mjs file, so the runner does not pick it up directly.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { minifyFile } from '../../src/lib/minify.js';
import { ROOT, unwrapConstant } from './generated.mjs';

export { GENERATED, readGeneratedConstant, readSource, ROOT, SOURCE, unwrapConstant } from './generated.mjs';

/** Scratch space for fixtures; each test file cleans up its own with `test.after`. */
export const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nooxy-minify-'));

export function removeTempDir() {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Runs a build step with its progress output silenced. Named apart from the harness's
 * async quietly() so a test that needs both does not collide.
 *
 * minifyFile reports progress on stdout, which would bury the test results. It
 * used to call process.exit on failure, so this helper also had to monkey-patch
 * process.exit and rethrow as MINIFY_REJECTED — which meant the tests passed
 * while the real CLI abandoned every remaining asset. minifyFile now throws, so
 * failures propagate as ordinary errors and only the noise needs suppressing.
 */
export function quietBuild(run) {
  const realLog = console.log;
  const realError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return run();
  } finally {
    console.log = realLog;
    console.error = realError;
  }
}

/**
 * Puts source through the real minifyFile pipeline.
 *
 * @param {string} code
 * @param {'js' | 'css' | 'html'} fileType
 * @param {{minify?: boolean, outFile?: string}} [options]
 * @returns {{value: string, stats: object, file: string}} the minified string,
 *   the reported sizes, and the raw generated module
 */
export function runMinifier(code, fileType, { minify = true, outFile } = {}) {
  const inFile = path.join(tempDir, `in.${fileType}`);
  const target = outFile ?? path.join(tempDir, 'out.ts');
  fs.writeFileSync(inFile, code);

  const stats = quietBuild(() => minifyFile(inFile, target, 'X', minify, fileType));
  const file = fs.readFileSync(target, 'utf8');
  return { value: unwrapConstant(file, 'X'), stats, file };
}

/** Convenience wrapper for the common case: just the minified text. */
export function minify(code, fileType, options) {
  return runMinifier(code, fileType, options).value;
}

/** Evaluates a snippet in its own function scope, for before/after comparison. */
export function evaluate(code) {
  return new Function(`return (function(){${code}})()`)();
}
