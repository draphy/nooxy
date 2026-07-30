// Reading the committed build artefacts.
//
// The browser assets ship as TypeScript modules holding one template literal,
// so several test files need to evaluate that literal back into the original
// string. Kept separate from the minify and proxy harnesses because it has no
// side effects — no temp directories, no stubbed globals.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Evaluates `export const NAME = \`...\`;` back into the string it holds.
 *
 * @param {string} source - contents of a generated module
 * @param {string} [constantName] - defaults to any identifier
 */
export function unwrapConstant(source, constantName = '\\w+') {
  const match = source.match(new RegExp(`^export const ${constantName} = \`([\\s\\S]*)\`;\\s*$`));
  assert.ok(match, 'generated module is not in the expected shape');
  return new Function(`return \`${match[1]}\``)();
}

/** Reads a repo file relative to the project root. */
export function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Reads one of the committed bundles and returns the string it holds. */
export function readGeneratedConstant(relativePath) {
  return unwrapConstant(readSource(relativePath));
}

/** Paths of the assets the build produces, so tests refer to them in one place. */
export const GENERATED = {
  headJs: 'src/rewriters/custom/generated/_head-js-string.ts',
  headCss: 'src/rewriters/custom/generated/_head-css-string.ts',
};

export const SOURCE = {
  headJs: 'src/rewriters/custom/head.js',
  headCss: 'src/rewriters/custom/head.css',
  headerHtml: 'src/cli/templates/header.html',
};
