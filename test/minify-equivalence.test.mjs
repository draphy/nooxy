// Semantic equivalence: minified JavaScript must compute what the source did.
//
// The other minifier files assert on the shape of the output — that a space was
// dropped, that a comment was removed. This one ignores the output entirely and
// asserts only that running it produces the same answer. That is the property
// that actually matters: nooxy ships whatever comes out of here as the injected
// bundle, so a minifier that mangles a program breaks every site silently, and
// no assertion about whitespace would notice.
//
// Programs are generated from a grammar weighted towards the constructs that
// historically break single-pass minifiers — regex literals next to division,
// ASI, template literals, and comments containing quotes — rather than sampled
// from a fixed table, so this covers combinations nobody thought to write down.

import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate, minify, removeTempDir } from './helpers/minify.mjs';

/**
 * Deterministic PRNG. A fixed seed keeps a failure reproducible: the same run
 * always generates the same programs, so a red test can be debugged directly.
 */
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** The pieces a generated program is assembled from, by hazard class. */
const ATOMS = [
  // Regex vs division: the classic ambiguity a scanner has to resolve.
  //
  // A regex has to contain whitespace or a `//` for the misreading to show up.
  // Without that the two readings minify to the same text and the program keeps
  // working by accident, so these atoms carry both.
  () => "/a b/.test('a b')",
  () => "/[a-z] [0-9]/.test('x 1')",
  () => "/\\/\\//.test('//')",
  () => "'a b'.replace(/a b/, 'c')",
  () => "/[a-z/]+/.test('a/b')",
  () => "'a/b/c'.split('/').length",
  () => '(84 / 2)',
  () => '(10 / 2 / 5)',
  () => "'x'.replace(/x/g, 'y')",
  () => '[1,2,3].filter(function(n){ return /2/.test(String(n)) }).length',

  // Strings and templates carrying characters that terminate the wrong token.
  () => "'it\\'s'",
  () => '"say \\"hi\\""',
  () => '`a${1 + 1}b`',
  () => '`outer ${`inner ${2}`} end`',
  () => "'/* not a comment */'",
  () => "'// not a comment'",
  () => '`multi\nline`',

  // Operators whose spacing cannot be dropped without changing meaning.
  () => '(1 + +1)',
  () => '(3 - -2)',
  () => '(5 + ++counter)',
  () => '(counter++ + 1)',
  () => '(1 < 2 ? 10 : 20)',
  () => '(typeof counter === "number" ? 1 : 0)',
  () => '(null ?? 7)',
  () => '(({a:1}).a ?? 2)',

  // Plain values, so not every program is a puzzle.
  () => '42',
  () => "'plain'",
  () => '[1,2,3].length',
  () => '({ a: 1, b: 2 }).b',
];

const COMMENTS = [
  "// an apostrophe: don't stop scanning here\n",
  '// a quote: "neither should this"\n',
  "/* a block comment with an apostrophe: don't */\n",
  '/* a block comment with a backtick: ` */\n',
  '/* a slash / and a star * inside */\n',
  '// a regex-looking thing: /abc/\n',
];

/** Builds one self-contained program that returns a deterministic value. */
function generateProgram(next) {
  const pick = (list) => list[Math.floor(next() * list.length)];
  const lines = ['var counter = 1;', 'var parts = [];'];

  const statements = 2 + Math.floor(next() * 4);
  for (let n = 0; n < statements; n++) {
    if (next() < 0.35) {
      lines.push(pick(COMMENTS).trimEnd());
    }

    const value = pick(ATOMS)();
    const style = next();

    if (style < 0.2) {
      // A block, so brace handling is exercised as well as expressions.
      lines.push(`if (counter > 0) {\n  parts.push(${value});\n} else {\n  parts.push(0);\n}`);
    } else if (style < 0.35) {
      lines.push(`for (var i${n} = 0; i${n} < 2; i${n}++) {\n  parts.push(${value});\n}`);
    } else if (style < 0.5) {
      // No semicolon: ASI has to insert one, and the minifier must not join
      // these two lines into a single broken statement.
      lines.push(`var v${n} = ${value}`);
      lines.push(`parts.push(v${n})`);
    } else {
      lines.push(`parts.push(${value});`);
    }
  }

  lines.push('return parts.join("|") + ":" + counter;');
  return lines.join('\n');
}

/** Runs a snippet, describing a throw as a value so the two runs stay comparable. */
function outcomeOf(code) {
  try {
    return { ok: true, value: evaluate(code) };
  } catch (error) {
    return { ok: false, error: error.constructor.name };
  }
}

test('minified JavaScript computes what the source computed', async (t) => {
  await t.test('400 generated programs are unchanged by minification', () => {
    const next = random(20260729);
    let checked = 0;

    for (let n = 0; n < 400; n++) {
      const source = generateProgram(next);
      const before = outcomeOf(source);

      // The generator is meant to emit runnable programs. If one does not
      // parse, that is a bug in the generator, not a finding about the
      // minifier, and silently skipping it would hollow out the whole test.
      assert.ok(before.ok, `generated an unrunnable program:\n${source}\n${before.error}`);

      const minified = minify(source, 'js');
      const after = outcomeOf(minified);

      assert.deepEqual(
        after,
        before,
        `minification changed the result\n\n--- source ---\n${source}\n\n--- minified ---\n${minified}\n`,
      );
      checked++;
    }

    assert.equal(checked, 400, 'not every generated program was checked');
  });

  await t.test('the generated corpus actually exercises the hazards', () => {
    // A generator that quietly stopped emitting regex literals would leave this
    // file passing while testing nothing interesting.
    const next = random(20260729);
    const corpus = Array.from({ length: 400 }, () => generateProgram(next)).join('\n');

    for (const [hazard, pattern] of [
      ['regex literal', /\/\[a-z\/\]\+\//],
      ['regex containing whitespace', /\/a b\//],
      ['division', /\d \/ \d/],
      ['template literal', /`a\$\{/],
      ['comment with an apostrophe', /don't/],
      ['statement without a semicolon', /^var v\d+ = .*[^;]$/m],
      ['nested block', /^\s*parts\.push\(.*\);$/m],
    ]) {
      assert.match(corpus, pattern, `the corpus contains no ${hazard}`);
    }
  });
});

test('minification preserves behaviour for the constructs that break scanners', async (t) => {
  // Named cases alongside the fuzzer: when one of these regresses the failure
  // message names the construct instead of dumping a generated program.
  const CASES = [
    ['a regex containing a slash', "return /[a-z/]+/.test('a/b') ? 'y' : 'n';"],
    // Whitespace inside a regex is the case that separates the two readings:
    // read as division, the space is dropped and /a b/ silently becomes /ab/.
    ['a regex containing a space', "return /a b/.test('a b') ? 'y' : 'n';"],
    ['a regex containing a double slash', "return /\\/\\//.test('//') ? 'y' : 'n';"],
    ['division that looks like a regex', 'var a = 10, b = 2; return a / b / 1;'],
    ['a regex after a closing paren', "return (1, 'ab').replace(/b/, 'c');"],
    ['division after a closing paren', 'return (10) / 2;'],
    ['a keyword followed by a regex', "return typeof /x/ === 'object' ? 1 : 0;"],
    ['ASI between two statements', 'var a = 1\nvar b = 2\nreturn a + b'],
    ['a return value on its own line', 'var a = 1\nreturn a'],
    ['a template literal spanning lines', 'return `a\nb`.length;'],
    ['a nested template literal', 'return `x${`y${1}`}z`;'],
    ['an apostrophe inside a comment', "// don't\nreturn 1;"],
    ['a block comment holding a quote', '/* "q" */\nreturn 2;'],
    ['a string that looks like a comment', "return '// not a comment'.length;"],
    ['increment next to addition', 'var i = 1; return i++ + ++i;'],
    ['unary plus after addition', 'return 1 + +1;'],
    ['unary minus after subtraction', 'return 3 - -2;'],
    ['optional chaining and nullish coalescing', 'var o = { a: { b: 0 } }; return o?.a?.b ?? 9;'],
    ['a class with a private field', 'class C { #x = 5; get x() { return this.#x } } return new C().x;'],
    ['a labelled break', 'var n = 0; outer: for (var i = 0; i < 3; i++) { n++; break outer; } return n;'],
  ];

  for (const [description, source] of CASES) {
    await t.test(description, () => {
      const expected = outcomeOf(source);
      assert.ok(expected.ok, `the case itself does not run: ${expected.error}`);
      assert.deepEqual(outcomeOf(minify(source, 'js')), expected, `minified to:\n${minify(source, 'js')}`);
    });
  }
});

test.after(removeTempDir);
