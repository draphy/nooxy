// CSS and HTML minification. Both formats reach users through `npx nooxy
// generate`, which minifies their own head.css and header.html, so a mistake
// here corrupts their site rather than ours.
//
// CSS and HTML cannot be evaluated the way JS can, so each case states the exact
// expected output. That makes any behaviour change visible in the diff.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { minify, removeTempDir, ROOT } from './helpers/minify.mjs';

// [description, input, expected]
const CSS_CASES = [
  // Whitespace inside a math function is part of the grammar. Dropping it makes
  // the expression invalid and the browser discards the declaration entirely.
  ['calc keeps the spaces around +', '.a{width:calc(100% + 10px)}', '.a{width:calc(100% + 10px)}'],
  ['calc keeps the spaces around -', '.a{width:calc(100% - 10px)}', '.a{width:calc(100% - 10px)}'],
  [
    'clamp keeps operator spacing but tightens commas',
    '.a{font-size:clamp(1rem, 2vw + 1rem, 3rem)}',
    '.a{font-size:clamp(1rem,2vw + 1rem,3rem)}',
  ],
  ['nested math functions', '.a{width:calc(100% - min(10px, 2vw))}', '.a{width:calc(100% - min(10px,2vw))}'],
  ['a plain function still tightens', '.a{color:rgba(0, 0, 0, 0.5)}', '.a{color:rgba(0,0,0,0.5)}'],

  // ':' means different things inside and outside a declaration block.
  ['descendant combinator before a pseudo-class is kept', '.a :hover{color:red}', '.a :hover{color:red}'],
  ['a compound pseudo-class is untouched', '.a:hover{color:red}', '.a:hover{color:red}'],
  ['declaration colon is tightened', '.a{color : red}', '.a{color:red}'],
  [
    'media feature colon is tightened',
    '@media (max-width: 768px){.a{color:red}}',
    '@media (max-width:768px){.a{color:red}}',
  ],
  [
    'media query keeps the space before (',
    '@media screen and (min-width: 1px){.a{color:red}}',
    '@media screen and (min-width:1px){.a{color:red}}',
  ],

  // Selector combinators.
  ['child combinator', '.a > .b{color:red}', '.a>.b{color:red}'],
  ['adjacent sibling combinator', '.a + .b{color:red}', '.a+.b{color:red}'],
  ['general sibling combinator', '.a ~ .b{color:red}', '.a~.b{color:red}'],
  ['descendant combinator is preserved', '.a .b{color:red}', '.a .b{color:red}'],
  ['descendant before an attribute selector', 'div [data-x]{color:red}', 'div [data-x]{color:red}'],
  ['compound attribute selector', 'div[data-x]{color:red}', 'div[data-x]{color:red}'],
  ['nth-child expression', '.a:nth-child(2n + 1){color:red}', '.a:nth-child(2n+1){color:red}'],
  ['relational pseudo-class', '.a:has(> div > svg){color:red}', '.a:has(>div>svg){color:red}'],

  // Values that must survive verbatim.
  ['quoted value with a space', '[data-x="a b"]{color:red}', '[data-x="a b"]{color:red}'],
  ['font stack', '.a{font-family:"A B", C}', '.a{font-family:"A B",C}'],
  ['grid template areas', '.a{grid-template-areas:"h h" "s m"}', '.a{grid-template-areas:"h h" "s m"}'],
  [
    'data uri',
    '.a{background:url("data:image/svg+xml;utf8,<svg/>")}',
    '.a{background:url("data:image/svg+xml;utf8,<svg/>")}',
  ],
  ['unquoted url', '.a{background:url(a.png)}', '.a{background:url(a.png)}'],
  ['custom property', ':root{--x: 1px}', ':root{--x:1px}'],

  // Structural tidying.
  ['important is tightened', '.a{color:red !important}', '.a{color:red!important}'],
  ['trailing semicolon is dropped', '.a{color:red;}', '.a{color:red}'],
  ['repeated semicolons collapse', '.a{color:red;;background:blue}', '.a{color:red;background:blue}'],
  ['comments are removed', "/* it's a note */\n.a{color:red}", '.a{color:red}'],
  ['licence comments are kept', '/*! keep me */\n.a{color:red}', '/*! keep me */ .a{color:red}'],
  [
    'keyframe percentages',
    '@keyframes k{ 0% { left:0 } 100% { left:100% } }',
    '@keyframes k{0%{left:0}100%{left:100%}}',
  ],
  ['multiple selectors', '.a,\n.b{color:red}', '.a,.b{color:red}'],

  // CSS nesting: a block can hold declarations and selectors, so brace depth
  // alone cannot decide what a ':' means.
  ['nested selector keeps its descendant combinator', '.a{ .b :hover{color:red} }', '.a{.b :hover{color:red}}'],
  ['nested selector still tightens combinators', '.a{ & > .b{color:red} }', '.a{&>.b{color:red}}'],
  [
    'declaration and nested selector in one block',
    '.a{color:red; .b :hover{color:blue}}',
    '.a{color:red;.b :hover{color:blue}}',
  ],
  ['nested ampersand descendant', '.a{& .b{color:red}}', '.a{& .b{color:red}}'],

  // Vendor prefixes and functional values.
  [
    'vendor prefixed calc keeps operator spacing',
    '.a{width:-webkit-calc(100% + 10px)}',
    '.a{width:-webkit-calc(100% + 10px)}',
  ],
  ['calc nested in a var fallback', '.a{width:var(--x, calc(1px + 2px))}', '.a{width:var(--x,calc(1px + 2px))}'],
  ['font shorthand slash', '.a{font:12px/1.5 Arial}', '.a{font:12px/1.5 Arial}'],
  ['grid-area slashes', '.a{grid-area:1 / 2 / 3 / 4}', '.a{grid-area:1 / 2 / 3 / 4}'],
  ['supports rule', '@supports (display: grid){.a{color:red}}', '@supports (display:grid){.a{color:red}}'],
  ['is and not', '.a:is(.b, .c):not(.d){color:red}', '.a:is(.b,.c):not(.d){color:red}'],
  ['attribute operators', '[class^="a"][lang|="en"]{color:red}', '[class^="a"][lang|="en"]{color:red}'],
  ['comment inside a value', '.a{color: /* note */ red}', '.a{color:red}'],
  ['media list', '@media screen, print{.a{color:red}}', '@media screen,print{.a{color:red}}'],
  ['empty rule', '.a{}', '.a{}'],
  [
    'multiple backgrounds',
    '.a{background:url(a.png) no-repeat, url(b.png)}',
    '.a{background:url(a.png) no-repeat,url(b.png)}',
  ],
];

// [description, input, expected]
const HTML_CASES = [
  // Whitespace between inline elements is rendered; between blocks it is not.
  ['space between inline elements is kept', '<span>a</span> <span>b</span>', '<span>a</span> <span>b</span>'],
  ['space between block elements is dropped', '<div>a</div>\n<div>b</div>', '<div>a</div><div>b</div>'],
  ['space between list items is dropped', '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>', '<ul><li>a</li><li>b</li></ul>'],
  ['indentation inside a block is dropped', '<div>\n  <span>a</span>\n</div>', '<div><span>a</span></div>'],

  // Text content is not markup and must not be rewritten.
  ['equals sign in text', '<p>a = b</p>', '<p>a = b</p>'],
  ['angle bracket entity in text', '<p>a &lt; b</p>', '<p>a &lt; b</p>'],
  ['non-breaking space entity', '<p>a&nbsp;b</p>', '<p>a&nbsp;b</p>'],
  ['runs of spaces in text collapse', '<p>a    b</p>', '<p>a b</p>'],

  // Tags.
  ['attribute spacing is normalized', '<div  class = "a"   id="b" >x</div>', '<div class="a" id="b">x</div>'],
  ['dashed attribute name', '<div data-foo="a b">x</div>', '<div data-foo="a b">x</div>'],
  ['unquoted attribute value', '<div class=foo>x</div>', '<div class=foo>x</div>'],
  ['boolean attribute', '<input disabled>', '<input disabled>'],
  ['self closing tag', '<br /><img src="a.png" />', '<br/><img src="a.png"/>'],
  ['> inside an attribute value', '<div title="a > b">x</div>', '<div title="a > b">x</div>'],
  ['case of an SVG element is preserved', '<svg><linearGradient id="g"/></svg>', '<svg><linearGradient id="g"/></svg>'],

  // Verbatim regions.
  [
    'script content is untouched',
    '<div><script>var a = 1 / 2;</script></div>',
    '<div><script>var a = 1 / 2;</script></div>',
  ],
  ['pre content is untouched', '<pre>  a\n  b</pre>', '<pre>  a\n  b</pre>'],
  ['textarea content is untouched', '<textarea>  a  </textarea>', '<textarea>  a  </textarea>'],
  ['style content is untouched', '<style>.a { color : red }</style>', '<style>.a { color : red }</style>'],

  // Comments.
  ['comments are removed', '<div><!-- note -->x</div>', '<div>x</div>'],
  ['conditional comments are kept', '<!--[if IE]><p>ie</p><![endif]-->', '<!--[if IE]><p>ie</p><![endif]-->'],
  ['bang comments are kept', '<!--! keep --><div>x</div>', '<!--! keep --><div>x</div>'],
  ['doctype is kept', '<!DOCTYPE  html>\n<div>x</div>', '<!DOCTYPE html><div>x</div>'],
  ['degenerate empty comment', '<!--><div>x</div>', '<div>x</div>'],
  ['degenerate short comment', '<!---><div>x</div>', '<div>x</div>'],

  // Inline elements other than span.
  ['anchors are inline', '<a href="x">a</a> <a href="y">b</a>', '<a href="x">a</a> <a href="y">b</a>'],
  ['image inside a text run', '<p>a <img src="i.png"> b</p>', '<p>a <img src="i.png"> b</p>'],
  [
    'inline children of a block are trimmed at the edges',
    '<div>  <em>a</em> <strong>b</strong>  </div>',
    '<div><em>a</em> <strong>b</strong></div>',
  ],
  ['void elements', '<br><hr><input><img src="a">', '<br><hr><input><img src="a">'],
  [
    'svg camelCase children keep their case',
    '<svg><linearGradient/><clipPath/></svg>',
    '<svg><linearGradient/><clipPath/></svg>',
  ],
  ['text before the first tag', 'hello <span>x</span>', 'hello <span>x</span>'],
];

test('CSS minification', async (t) => {
  for (const [description, input, expected] of CSS_CASES) {
    await t.test(description, () => {
      assert.equal(minify(input, 'css'), expected);
    });
  }
});

test('HTML minification', async (t) => {
  for (const [description, input, expected] of HTML_CASES) {
    await t.test(description, () => {
      assert.equal(minify(input, 'html'), expected);
    });
  }
});

test('malformed input is rejected rather than silently truncated', async (t) => {
  await t.test('unterminated CSS comment', () => {
    assert.throws(() => minify('.a{color:red}\n/* never closed', 'css'), /conversion failed/);
  });

  await t.test('unterminated HTML comment', () => {
    assert.throws(() => minify('<div>x</div>\n<!-- never closed', 'html'), /conversion failed/);
  });

  await t.test('unterminated script element', () => {
    assert.throws(() => minify('<div><script>var a = 1;', 'html'), /conversion failed/);
  });

  await t.test('unterminated attribute value', () => {
    // This used to pass silently, swallowing the rest of the document into the
    // attribute and emitting a doubled '>':
    //   <div class="open>text</div>  ->  <div class="open>text</div>>
    // The tag-count sanity check cannot catch it, because both sides count two
    // tags, so nothing else would have reported it.
    assert.throws(() => minify('<div class="open>text</div>', 'html'), /conversion failed/);
  });
});

test("the project's own assets minify correctly", async (t) => {
  await t.test('head.css keeps every rule', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/rewriters/custom/head.css'), 'utf8');
    const minified = minify(source, 'css');
    const countRules = (text) => (text.match(/\{/g) ?? []).length;
    assert.equal(countRules(minified), countRules(source.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.ok(minified.length < source.length, 'expected the output to be smaller');
  });

  // The shipped template is a single explanatory comment, so it minifies away to
  // nothing. That is legitimate and must not be mistaken for a corrupted build -
  // otherwise `npx nooxy generate` fails for every new project.
  await t.test('the all-comment header.html template minifies to empty without error', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/cli/templates/header.html'), 'utf8');
    assert.match(source, /^\s*<!--[\s\S]*-->\s*$/, 'template is no longer comment-only; revisit this test');
    assert.equal(minify(source, 'html'), '');
  });

  await t.test('a CSS file that is only comments minifies to empty without error', () => {
    assert.equal(minify('/* just a note */\n', 'css'), '');
  });

  await t.test('a JS file that is only comments minifies to empty without error', () => {
    assert.equal(minify('// just a note\n', 'js'), '');
  });
});

test.after(removeTempDir);
