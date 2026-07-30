// Properties that must hold for every format, rather than behaviour of any one
// input. These catch whole classes of regression that a case table cannot:
//
//   1. Escaping round-trips. Whatever the minifier emits is wrapped in a
//      template literal, so escapeForTemplateLiteral has to be exactly
//      reversible or the shipped asset silently differs from the source.
//   2. Minification is idempotent. Minifying already-minified output must be a
//      no-op; if it is not, the first pass left something the second pass still
//      wants to change, which means one of them is wrong.
//   3. minify=false is a pure passthrough.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { minifyFile } from '../src/lib/minify.js';
import { removeTempDir, runMinifier, tempDir, quietBuild } from './helpers/minify.mjs';

const convert = (code, fileType, shouldMinify = true) => runMinifier(code, fileType, { minify: shouldMinify });

/** Deterministic pseudo-random corpus over the characters that break escaping. */
function fuzzCorpus(count) {
  const alphabet = ['\\', '`', '$', '{', '}', "'", '"', '\n', 'a', '1', ' '];
  let seed = 12345;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const corpus = [];
  for (let n = 0; n < count; n++) {
    let value = '';
    const length = 1 + Math.floor(next() * 12);
    for (let k = 0; k < length; k++) {
      value += alphabet[Math.floor(next() * alphabet.length)];
    }
    corpus.push(value);
  }
  return corpus;
}

const ESCAPE_CASES = [
  'plain text',
  'back\\slash',
  'trailing backslash \\',
  'double \\\\ backslash',
  'a `backtick` b',
  'dollar $ alone',
  'interp ${x}',
  'already escaped \\${x}',
  'nested `${`a`}`',
  'newline\nhere',
  'quote \' and "',
  '$$$$$',
  '`````',
  '\\`${',
  '${}',
  '\\\\`',
];

const SAMPLES = {
  js: [
    'const a = 1;\nconst b = 2;\nreturn a + b;',
    "function f(){ return /[^/ ]+/.exec('a b')[0]; }",
    'let i = 1; return i++ + ++i;',
    'const s = `a${1}b`; return s;',
    '// comment\nconst a = 1;\nreturn a',
    'const a = 1\nconst b = 2\nreturn a + b',
    'class C{#x=1;get x(){return this.#x}}',
    'const o={a:{b:1}};return o?.a?.b ?? 0',
  ],
  css: [
    '.a{width:calc(100% + 10px)}',
    '.a :hover{color:red}',
    '.a{ .b :hover{color:red} }',
    '@media screen and (min-width: 1px){.a{color:red}}',
    '.a{color:red !important;}',
    '/*! keep */\n.a{color:red}',
    '.a{font:12px/1.5 Arial}',
    '.a{grid-area:1 / 2 / 3 / 4}',
  ],
  html: [
    '<span>a</span> <span>b</span>',
    '<div>\n  <span>a</span>\n</div>',
    '<p>a = b</p>',
    '<div  class = "a" >x</div>',
    '<pre>  a\n  b</pre>',
    '<!--[if IE]><p>ie</p><![endif]-->',
    '<div><script>var a = 1 / 2;</script></div>',
    '<br /><img src="a.png" />',
  ],
};

test('template literal escaping round-trips exactly', async (t) => {
  for (const input of ESCAPE_CASES) {
    await t.test(JSON.stringify(input), () => {
      assert.equal(convert(input, 'html', false).value, input);
    });
  }

  await t.test('300 fuzzed inputs over backslash, backtick, $, braces and quotes', () => {
    for (const input of fuzzCorpus(300)) {
      assert.equal(convert(input, 'html', false).value, input, `did not round-trip: ${JSON.stringify(input)}`);
    }
  });
});

test('minification is idempotent', async (t) => {
  for (const [fileType, samples] of Object.entries(SAMPLES)) {
    await t.test(fileType, () => {
      for (const sample of samples) {
        const once = convert(sample, fileType).value;
        const twice = convert(once, fileType).value;
        assert.equal(twice, once, `second pass changed the output for ${JSON.stringify(sample)}`);
      }
    });
  }
});

test('minify=false passes the source through untouched', async (t) => {
  for (const [fileType, samples] of Object.entries(SAMPLES)) {
    await t.test(fileType, () => {
      for (const sample of samples) {
        assert.equal(convert(sample, fileType, false).value, sample);
      }
    });
  }
});

test('minifyFile contract', async (t) => {
  await t.test('reports the sizes it actually processed', () => {
    const source = '.a {\n  color : red;\n}\n';
    const { stats, value } = convert(source, 'css');
    assert.equal(stats.originalSize, source.length);
    assert.equal(stats.processedSize, value.length);
    assert.ok(stats.processedSize < stats.originalSize);
  });

  await t.test('emits a valid TypeScript module', () => {
    const { file } = convert('.a{color:red}', 'css');
    assert.match(file, /^export const X = `[\s\S]*`;$/);
  });

  await t.test('a missing input file is reported rather than ignored', () => {
    assert.throws(
      () =>
        quietBuild(() =>
          minifyFile(path.join(tempDir, 'does-not-exist.css'), path.join(tempDir, 'out.ts'), 'X', true, 'css'),
        ),
      /conversion failed/,
    );
  });

  await t.test('the output file is not written when minification is rejected', () => {
    const inFile = path.join(tempDir, 'broken.css');
    const outFile = path.join(tempDir, 'not-written.ts');
    fs.writeFileSync(inFile, '.a{color:red}\n/* never closed');
    fs.rmSync(outFile, { force: true });

    assert.throws(() => quietBuild(() => minifyFile(inFile, outFile, 'X', true, 'css')), /conversion failed/);
    assert.equal(fs.existsSync(outFile), false, 'a rejected build must not leave a stale asset behind');
  });
});

test.after(removeTempDir);
