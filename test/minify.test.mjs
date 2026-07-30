// The JS minifier in src/lib/minify.js is regex based, so constructs it
// mishandles produce silently broken bundles that only surface in a browser.
// Each case is minified through the real minifyFile() path, then both the
// original and the minified form are evaluated and compared.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { evaluate, minify, removeTempDir, ROOT } from './helpers/minify.mjs';

// [description, snippet] — the snippet's return value must survive minification
const CASES = [
  // Regex literals: the delimiter scanner has to know where a pattern ends.
  ['unescaped / inside a character class', String.raw`return /^https?:\/\/[^/]*/.exec('https://a.com/b')[0]`],
  ['character class containing / and a space', String.raw`return /[^/ ]+/.exec('a b')[0]`],
  ['character class containing //', String.raw`return /[//]/.test('/')`],
  ['character class with an escaped bracket', String.raw`return /[\]]/.test(']')`],
  ['negated class ending in a dash', String.raw`return /[^/-]+/.exec('ab-c')[0]`],
  ['quantifier following a character class', String.raw`return /[^/]{2,3}/.exec('abcd')[0]`],
  [
    'the isSuppressedUrl pattern from head.js',
    String.raw`return /^https?:\/\/(?:[^@/:]*:[^@/]*@)?([^/:]*)/i.exec('https://u:p@h.com/x')[1]`,
  ],
  ['escaped slashes', String.raw`return 'a/b'.replace(/\//g,'-')`],
  ['quotes inside a pattern', String.raw`return /["']/.test('a"b')`],
  ['flags', String.raw`return 'AaA'.replace(/a/gi,'-')`],
  ['pattern after return', String.raw`return /x/.source`],
  ['pattern in an array literal', String.raw`return [/a/,/b/].map(r=>r.source).join(',')`],
  ['pattern in an object literal', String.raw`const o={re:/x/};return o.re.source`],
  ['pattern after an arrow', String.raw`const f=()=>/ab/;return f().test('ab')`],
  ['pattern in a ternary', String.raw`return (1?/a/:/b/).source`],
  ['$& in a replacement string', String.raw`return 'ab'.replace(/a/,'[$&]')`],
  ['two patterns on one line', String.raw`return /a/.test('a') && /b/.test('b')`],

  // A '/' straight after ')' is a regex when the group was a control-flow head
  // and a division when it was a value. Only the opening keyword separates them.
  ['regex immediately after if(...)', "let r=0; if (true) /a b/.test('a b') && (r=1); return r"],
  ['regex immediately after while(...)', "let r=0,n=0; while (n++ < 1) /a b/.test('a b') && (r=1); return r"],
  ['regex immediately after for(...)', "let r=0; for (let i=0;i<1;i++) /a b/.test('a b') && (r=1); return r"],
  ['regex after a call inside an if head', "let r=0; const f=()=>true; if (f()) /a b/.test('a b') && (r=1); return r"],
  ['division immediately after a call', 'const f=()=>10; return f() / 2'],
  ['division inside an if body', 'const f=()=>10; let r=0; if (true) { r = f() / 2 } return r'],

  // Division must not be mistaken for a regex delimiter.
  ['division', String.raw`return 10/2`],
  ['division after a closing paren', String.raw`const a=10,b=2;return (a+b)/3`],
  ['chained division', String.raw`return 100/5/2`],
  ['division following a character class', String.raw`const n=/[^/]+/.exec('abc')[0].length;return n/1`],

  // Comments and strings: neither may consume the other.
  ['comment containing a url', '// see https://example.com/x\nreturn 1'],
  ['comment containing an unbalanced apostrophe', "// don't touch this\nconst s='ok';return s"],
  ['block comment containing an apostrophe', "/* it's fine */\nreturn 'ok'"],
  ['string that looks like a comment', String.raw`return '// not a comment'`],
  ['string that looks like a block comment', String.raw`return '/* nope */'`],
  ['string containing a url', String.raw`return 'https://a/b'`],

  // Template literals.
  ['template containing slashes', 'return `//not a comment`'],
  ['template with an expression', 'const x=1;return `a${x}b`'],
  ['nested template', 'return `a${`b`}c`'],
  ['template whose expression holds a regex', "const s='a/b';return `${s.replace(/\\//g,'-')}`"],

  // Operators that change meaning when whitespace is dropped.
  ['post- and pre-increment', String.raw`let i=1;return i++ + ++i`],
  ['subtraction of a negated value', String.raw`const a=1,b=1;return a - -b`],
  ['addition of a unary plus', String.raw`const a=1,b=1;return a + +b`],
  ['typeof', String.raw`return typeof 1`],
  ['instanceof', String.raw`return [] instanceof Array`],
  ['in operator', String.raw`return 'a' in {a:1}`],
  ['property access on a number literal', String.raw`return 1 .toString()`],

  // Statements terminated by a newline rather than a semicolon.
  ['automatic semicolon insertion', 'const a = 1\nconst b = 2\nreturn a + b'],
  ['ASI with a trailing call', 'const a = [1,2]\nconst b = a.length\nreturn b'],
  ['continuation across a newline', 'const a = 1 +\n2\nreturn a'],

  // Constructs whose contents must never be reinterpreted.
  ['comment containing a backtick', '// a ` backtick\nreturn 1'],
  ['comment containing an apostrophe and a quote', `// it's a "thing"\nreturn 1`],
  ['comment containing a block-comment opener', '// nested /* opener\nreturn 1'],
  ['string containing a backtick', "return 'a ` b'"],
  ['string ending in an escaped backslash', String.raw`return 'a\\'`],
  ['division after a subscript', String.raw`const a=[4];return a[0]/2`],
  ['template holding a nested template with a regex', 'const s=`a/b`;return `${`${s.replace(/\\//g,"-")}`}`'],

  // Modern syntax the scanner has to tokenize without special cases.
  ['optional chaining and nullish coalescing', 'const o={a:{b:1}};return o?.a?.b ?? 0'],
  ['nullish assignment', 'let a=null;a ??= 5;return a'],
  ['exponent operator', String.raw`return 2 ** 3`],
  ['spread', 'const a=[1,2];return [...a, 3].length'],
  ['numeric separator', String.raw`return 1_000`],
  ['bigint literal', 'return String(10n)'],
  ['regex v flag', String.raw`return /[\p{ASCII}]/v.test('a')`],
  ['arrow returning an object literal', 'const f=()=>({a:1});return f().a'],
  ['tagged template', 'const t=(s,...v)=>s.raw[0]+v[0];return t`a${1}`'],
  ['generator', 'function* g(){yield 1}return [...g()][0]'],
  ['private class field', 'class C{#x=1;get x(){return this.#x}}return new C().x'],
  ['class static block', 'class C{static v;static{C.v=7}}return C.v'],
  ['getter and setter', 'const o={_v:0,get v(){return this._v},set v(n){this._v=n}};o.v=3;return o.v'],
  ['labelled break', 'outer: for(let i=0;i<2;i++){for(let j=0;j<2;j++){break outer}}return 1'],
  ['destructuring with defaults', 'const {a=1,b=2}={a:5};return a+b'],
  ['regex containing an unescaped [', String.raw`return /[[]/.test('[')`],
  ['do-while', 'let i=0;do{i++}while(i<3);return i'],
  ['switch with a regex in a case body', "switch('a'){case 'a':return /x/.source}"],
  // ASI here is load bearing: the value must stay unreachable.
  ['return followed by a newline', 'function f(){return\n{a:1}}\nreturn f()===undefined'],
];

test('minified JavaScript keeps its behaviour', async (t) => {
  for (const [description, code] of CASES) {
    await t.test(description, () => {
      assert.deepEqual(evaluate(minify(code, 'js')), evaluate(code));
    });
  }
});

test('the build is rejected rather than shipping broken output', async (t) => {
  await t.test('output that no longer parses is rejected', () => {
    assert.throws(() => minify('const a = (1 + \nreturn a', 'js'), /conversion failed/);
  });

  await t.test('an unterminated string literal is rejected', () => {
    // Without a newline bail in the string scanner this swallows the following
    // lines up to the next quote, quietly deleting code.
    assert.throws(() => minify("const s = 'abc\nconst t = 'x';return t", 'js'), /conversion failed/);
  });

  await t.test('an unterminated block comment is rejected', () => {
    assert.throws(() => minify('const a = 1;\n/* never closed\nreturn a', 'js'), /conversion failed/);
  });
});

test('head.js itself survives minification', async (t) => {
  const headJs = fs.readFileSync(path.join(ROOT, 'src/rewriters/custom/head.js'), 'utf8');

  await t.test('minifies without being rejected', () => {
    assert.doesNotThrow(() => minify(headJs, 'js'));
  });

  // Regex literals are the construct most at risk from a regex-based minifier,
  // and these are the ones head.js actually depends on. Listed explicitly rather
  // than scraped, because scraping the source would also match slashes inside
  // comments and string literals.
  const CRITICAL_PATTERNS = [
    String.raw`/([a-fA-F0-9]{32})(?=\/?$)/`,
    // Quoted rather than String.raw: '${' interpolates even in a raw template.
    '/[.*+?^${}()|[\\]\\\\]/g',
    String.raw`/^https?:\/\/[^/]*/`,
    String.raw`/^https?:\/\/(?:[^@/:]*:[^@/]*@)?([^/:]*)/i`,
  ];

  await t.test('the regex literals head.js depends on survive verbatim', () => {
    const minified = minify(headJs, 'js');
    for (const pattern of CRITICAL_PATTERNS) {
      assert.ok(headJs.includes(pattern), `test is stale — ${pattern} is no longer in head.js`);
      assert.ok(minified.includes(pattern), `regex literal was altered by minification: ${pattern}`);
    }
  });
});

test.after(removeTempDir);
