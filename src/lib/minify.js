import fs from 'node:fs';

/**
 * Escapes code for safe inclusion in template literals
 * @param {string} code - The code to escape
 * @returns {string} - Escaped code
 */
function escapeForTemplateLiteral(code) {
  return (
    code
      // Escape backslashes first (must be done before other escapes)
      .replace(/\\/g, '\\\\')
      // Escape backticks
      .replace(/`/g, '\\`')
      // Escape template literal expressions ${...}
      .replace(/\$\{/g, '\\${')
  );
}

// Inside these, whitespace around '+' and '-' is part of the grammar. Dropping it
// makes the expression invalid and the browser discards the whole declaration.
const CSS_MATH_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp']);

// Whitespace directly after one of these is never meaningful.
const CSS_DROP_AFTER = new Set(['{', '}', ';', ',', '(']);

// Whitespace directly before one of these is never meaningful. '(' is absent on
// purpose: "@media screen and (x)" must keep its space, or "and(" becomes a
// function token and the query stops matching.
const CSS_DROP_BEFORE = new Set(['{', '}', ';', ',', ')', '!']);

const CSS_COMBINATOR = new Set(['>', '+', '~']);
const CSS_TOKEN_BREAK = new Set(['{', '}', ';', ':', ',', '(', ')', '!', '>', '+', '~', "'", '"']);

/**
 * Whether the statement starting here is a selector rather than a declaration,
 * decided by which structural character terminates it: '{' opens a block, while
 * ';' or '}' ends a declaration.
 *
 * Brace depth alone cannot answer this. CSS nesting lets a block hold both, so
 * inside ".a{ .b :hover{...} }" the inner statement is a selector even though it
 * sits one level deep - and its ':' must keep the descendant combinator.
 *
 * @param {string} code
 * @param {number} from - index to start looking from
 * @returns {boolean}
 */
function statementOpensBlock(code, from) {
  let depth = 0;
  let i = from;
  while (i < code.length) {
    const char = code[i];
    if (char === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      i = scanString(code, i);
      continue;
    }
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (depth === 0) {
      if (char === '{') {
        return true;
      }
      if (char === ';' || char === '}') {
        return false;
      }
    }
    i++;
  }
  return false;
}

/**
 * CSS minifier built on a single left-to-right scan.
 *
 * Comments and quoted strings are consumed whole and emitted verbatim. url() is
 * not special-cased: its contents survive because ':' and '/' either break the
 * token or are kept, so "url(data:image/svg+xml;base64,…)" and an escaped space
 * in "url(a\ b.png)" both round-trip. A quoted url() is covered by the string
 * rule above.
 *
 * Whitespace elsewhere is dropped only where the CSS grammar says it carries no
 * meaning, which depends on context: ':' separates a property from its value
 * inside a block but is part of a pseudo-selector outside one, so ".a :hover"
 * keeps its descendant combinator while "color: red" loses its space.
 *
 * @param {string} code - The CSS code to minify
 * @returns {string} - Minified CSS code
 */
function minifyCSS(code) {
  let out = '';
  let pendingSpace = false;
  let braceDepth = 0;
  let parenDepth = 0;
  let mathDepth = 0;
  let lastIdentifier = '';
  const parenIsMath = [];
  // Recomputed at each statement boundary; null means "not yet determined".
  let statementIsSelector = null;
  let i = 0;

  const canDropSpace = (prev, next) => {
    if (!prev || !next) {
      return true;
    }
    // Inside calc()/clamp() only the argument separators are safe to tighten.
    if (mathDepth > 0) {
      return prev === '(' || prev === ',' || next === ')' || next === ',';
    }
    if (CSS_DROP_AFTER.has(prev) || CSS_DROP_BEFORE.has(next)) {
      return true;
    }
    if (prev === ':' || next === ':') {
      // A media feature or functional-pseudo colon inside parentheses, or the
      // colon separating a property from its value. In a selector the colon
      // introduces a pseudo-class, where a leading space is a descendant
      // combinator and must survive.
      return parenDepth > 0 || !statementIsSelector;
    }
    // Combinators only carry meaning in a selector.
    if (statementIsSelector && (CSS_COMBINATOR.has(prev) || CSS_COMBINATOR.has(next))) {
      return true;
    }
    return false;
  };

  const write = (token) => {
    if (out.length > 0 && pendingSpace && !canDropSpace(out[out.length - 1], token[0])) {
      out += ' ';
    }
    out += token;
    pendingSpace = false;
  };

  while (i < code.length) {
    if (statementIsSelector === null) {
      statementIsSelector = statementOpensBlock(code, i);
    }
    const char = code[i];

    if (/\s/.test(char)) {
      pendingSpace = true;
      i++;
      continue;
    }

    // Comments. A '/*!' comment is a licence marker and is kept by convention.
    if (char === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error('unterminated CSS comment');
      }
      if (code[i + 2] === '!') {
        write(code.slice(i, end + 2));
      } else {
        pendingSpace = true;
      }
      i = end + 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const end = scanString(code, i);
      write(code.slice(i, end));
      i = end;
      continue;
    }

    if (char === '(') {
      // -webkit-calc() and friends follow the same grammar as calc().
      const functionName = lastIdentifier.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '');
      const isMath = CSS_MATH_FUNCTIONS.has(functionName);
      parenIsMath.push(isMath);
      if (isMath) {
        mathDepth++;
      }
      parenDepth++;
      write('(');
      lastIdentifier = '';
      i++;
      continue;
    }

    if (char === ')') {
      write(')');
      if (parenIsMath.pop()) {
        mathDepth--;
      }
      parenDepth = Math.max(0, parenDepth - 1);
      lastIdentifier = '';
      i++;
      continue;
    }

    if (char === '{') {
      braceDepth++;
      write('{');
      lastIdentifier = '';
      statementIsSelector = null;
      i++;
      continue;
    }

    if (char === '}') {
      // A semicolon immediately before a closing brace is redundant.
      while (out.endsWith(';')) {
        out = out.slice(0, -1);
      }
      braceDepth = Math.max(0, braceDepth - 1);
      write('}');
      lastIdentifier = '';
      statementIsSelector = null;
      i++;
      continue;
    }

    if (char === ';') {
      // Collapse empty declarations rather than emitting ";;".
      if (out.endsWith(';')) {
        pendingSpace = false;
        i++;
        continue;
      }
      write(';');
      lastIdentifier = '';
      statementIsSelector = null;
      i++;
      continue;
    }

    if (CSS_TOKEN_BREAK.has(char)) {
      write(char);
      lastIdentifier = '';
      i++;
      continue;
    }

    let end = i;
    while (end < code.length && !/\s/.test(code[end]) && !CSS_TOKEN_BREAK.has(code[end])) {
      if (code[end] === '/' && code[end + 1] === '*') {
        break;
      }
      end++;
    }
    const identifier = code.slice(i, end);
    write(identifier);
    lastIdentifier = identifier;
    i = end;
  }

  // Drop any trailing semicolon left at the very end.
  while (out.endsWith(';')) {
    out = out.slice(0, -1);
  }
  return out.trim();
}

// Content of these elements is whitespace-sensitive or is not HTML at all.
const HTML_VERBATIM_ELEMENTS = new Set(['script', 'style', 'pre', 'code', 'textarea']);

// Whitespace next to a block-level element cannot affect layout, so it can go.
// Between inline elements it is rendered, so it is collapsed to one space instead.
const HTML_BLOCK_ELEMENTS = new Set([
  'html',
  'head',
  'body',
  'div',
  'p',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'form',
  'fieldset',
  'legend',
  'blockquote',
  'figure',
  'figcaption',
  'hr',
  'address',
  'details',
  'summary',
  'dialog',
  'style',
  'script',
  'meta',
  'link',
  'title',
  'template',
]);

/**
 * @returns {number} index just past the closing quote of an HTML attribute value
 * @throws Error if the value is never closed
 *
 * Throwing rather than returning end-of-input: an unterminated value used to
 * swallow the rest of the document into the attribute and still emit a '>',
 * producing '<div class="open>text</div>>'. The tag-count sanity check cannot
 * catch that, because both sides count the same number of tags.
 */
function scanAttributeValue(code, start) {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length && code[i] !== quote) {
    i++;
  }
  if (i >= code.length) {
    // The offending text is quoted back, because this is the one error a user is
    // likely to hit in their own header.html and "missing closing quote" alone
    // gives them nothing to search for in a large file.
    const line = code.slice(0, start).split('\n').length;
    const snippet = code.slice(Math.max(0, start - 30), start + 30).replace(/\n/g, ' ');
    throw new Error(
      `unterminated HTML attribute value (missing closing ${quote}) on line ${line}, near: ...${snippet}...`,
    );
  }
  return i + 1;
}

/** Reads the element name at an opening '<', or '' if this is not a tag. */
function peekTagName(code, start) {
  let i = start + 1;
  if (code[i] === '/') {
    i++;
  }
  const nameStart = i;
  while (i < code.length && /[A-Za-z0-9:-]/.test(code[i])) {
    i++;
  }
  return code.slice(nameStart, i);
}

/**
 * HTML minifier built on a single left-to-right scan.
 *
 * Tags are parsed rather than pattern-matched, so '=' and '>' in text content or
 * inside attribute values are never mistaken for markup. Element names keep their
 * original case, because SVG and MathML names are case-sensitive.
 *
 * @param {string} code - The HTML code to minify
 * @returns {string} - Minified HTML code
 */
function minifyHTML(code) {
  let out = '';
  let i = 0;
  let previousTag = '';

  /** Normalizes a tag: single spaces between attributes, none around '='. */
  const readTag = (start) => {
    let i = start + 1;
    const isClosing = code[i] === '/';
    if (isClosing) {
      i++;
    }
    const nameStart = i;
    while (i < code.length && /[A-Za-z0-9:-]/.test(code[i])) {
      i++;
    }
    const name = code.slice(nameStart, i);
    const attributes = [];

    while (i < code.length && code[i] !== '>') {
      if (/\s/.test(code[i])) {
        i++;
        continue;
      }
      if (code[i] === '/' && code[i + 1] === '>') {
        break;
      }
      const attrStart = i;
      while (i < code.length && !/[\s=>]/.test(code[i]) && !(code[i] === '/' && code[i + 1] === '>')) {
        i++;
      }
      let attribute = code.slice(attrStart, i);

      let after = i;
      while (after < code.length && /\s/.test(code[after])) {
        after++;
      }
      if (code[after] === '=') {
        after++;
        while (after < code.length && /\s/.test(code[after])) {
          after++;
        }
        if (code[after] === '"' || code[after] === "'") {
          const end = scanAttributeValue(code, after);
          attribute += `=${code.slice(after, end)}`;
          i = end;
        } else {
          const valueStart = after;
          let end = after;
          while (end < code.length && !/[\s>]/.test(code[end])) {
            end++;
          }
          attribute += `=${code.slice(valueStart, end)}`;
          i = end;
        }
      }
      attributes.push(attribute);
    }

    let selfClosing = false;
    if (code[i] === '/' && code[i + 1] === '>') {
      selfClosing = true;
      i += 2;
    } else if (code[i] === '>') {
      i++;
    }

    const body = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    return { text: `<${isClosing ? '/' : ''}${name}${body}${selfClosing ? '/>' : '>'}`, end: i, name };
  };

  while (i < code.length) {
    // Comments. Conditional comments and '<!--!' markers are load bearing.
    if (code.startsWith('<!--', i)) {
      // Search from just after '<!' so the degenerate but legal empty forms
      // '<!-->' and '<!--->' terminate correctly instead of looking unclosed.
      const end = code.indexOf('-->', i + 2);
      if (end === -1) {
        throw new Error('unterminated HTML comment');
      }
      // startsWith with an offset, not slice: slicing here allocated the whole
      // rest of the file just to test three characters, once per comment.
      if (code.startsWith('[if', i + 4) || code[i + 4] === '!') {
        out += code.slice(i, end + 3);
      }
      i = end + 3;
      continue;
    }

    // Doctype and other declarations.
    if (code.startsWith('<!', i)) {
      const end = code.indexOf('>', i);
      const stop = end === -1 ? code.length : end + 1;
      out += code.slice(i, stop).replace(/\s+/g, ' ');
      i = stop;
      continue;
    }

    if (code[i] === '<' && /[A-Za-z/]/.test(code[i + 1] ?? '')) {
      const name = peekTagName(code, i);
      const lower = name.toLowerCase();

      // Elements whose content must not be touched.
      if (HTML_VERBATIM_ELEMENTS.has(lower) && code[i + 1] !== '/') {
        const closing = new RegExp(`</${lower}\\s*>`, 'i');
        const rest = code.slice(i);
        const match = closing.exec(rest);
        if (!match) {
          throw new Error(`unterminated <${lower}> element`);
        }
        out += rest.slice(0, match.index + match[0].length);
        i += match.index + match[0].length;
        previousTag = lower;
        continue;
      }

      const tag = readTag(i);
      out += tag.text;
      i = tag.end;
      previousTag = lower;
      continue;
    }

    // Text run, up to the next tag.
    let end = i;
    while (end < code.length && code[end] !== '<') {
      end++;
    }
    const text = code.slice(i, end);
    i = end;

    if (/^\s*$/.test(text)) {
      const nextTag = end < code.length ? peekTagName(code, end).toLowerCase() : '';
      const nextIsBlock = nextTag === '' || HTML_BLOCK_ELEMENTS.has(nextTag);
      const previousIsBlock = previousTag === '' || HTML_BLOCK_ELEMENTS.has(previousTag);
      // Between two inline elements the space is rendered, so keep one.
      if (!previousIsBlock && !nextIsBlock) {
        out += ' ';
      }
      continue;
    }

    out += text.replace(/\s+/g, ' ');
  }

  return out.trim();
}

/**
 * Advanced JavaScript minifier with better regex handling
 * @param {string} code - The JavaScript code to minify
 * @returns {string} - Minified JavaScript code
 *
 * Processing order is critical:
 * 1. Extract strings (protect "https://" from being seen as comments)
 * 2. Extract template literals (protect `${...}` expressions)
 * 3. Extract regex patterns (BEFORE comment removal - regex like /test\// has //)
 * 4. Remove comments (now safe - strings and regex are protected)
 * 5. Minify whitespace
 * 6. Restore in reverse order
 *
 * Key insight: regex extraction requires preceding context char (=, (, etc.)
 * so comments like "// path/to/file" won't match (/ is not a context char).
 */
const WORD_CHAR = /[A-Za-z0-9_$]/;
const REGEX_FLAG = /[dgimsuvy]/;

// After one of these keywords a '/' opens a regex literal rather than dividing.
const REGEX_AFTER_KEYWORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

// A group opened by one of these is a control-flow head, not a value, so a '/'
// straight after its ')' begins a regex: `if (a) /re/.test(b)`.
const CONTROL_FLOW_KEYWORD = new Set(['if', 'for', 'while', 'with', 'switch', 'catch']);

// Characters after which an expression must continue, so a following newline
// carries no meaning. ')' and ']' are absent on purpose: a statement can end with
// them, and dropping the newline there would join two statements.
const EXPRESSION_CONTINUES_AFTER = new Set([...'({[,;:?=!&|^~<>*/%+-']);

// Characters that cannot begin a statement, so a newline before one is redundant.
const EXPRESSION_CONTINUES_BEFORE = new Set([...')]},;.:?=*/%&|^<>']);

function isWordChar(char) {
  return char !== undefined && char !== '' && WORD_CHAR.test(char);
}

/**
 * @param {string} code
 * @param {number} start - index of the opening quote
 * @returns {number} index just past the closing quote
 */
function scanString(code, start) {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    const char = code[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === quote) {
      return i + 1;
    }
    // A string literal cannot span lines. Stop rather than swallowing the file.
    //
    // Defensive only: the scanner reaches a quote in code position, and comments
    // are consumed before that, so no valid or invalid input currently
    // distinguishes this branch. Mutation testing confirms no test can kill it.
    // Kept because the invariant is real and the guard costs nothing.
    if (char === '\n' || char === '\r') {
      return i;
    }
    i++;
  }
  return i;
}

/**
 * Follows ${...} substitutions so nested templates, strings and braces inside
 * them are consumed as part of the literal.
 * @param {string} code
 * @param {number} start - index of the opening backtick
 * @returns {number} index just past the closing backtick
 */
function scanTemplate(code, start) {
  let i = start + 1;
  while (i < code.length) {
    const char = code[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '`') {
      return i + 1;
    }
    if (char === '$' && code[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < code.length && depth > 0) {
        const inner = code[i];
        if (inner === '\\') {
          i += 2;
        } else if (inner === '`') {
          i = scanTemplate(code, i);
        } else if (inner === "'" || inner === '"') {
          i = scanString(code, i);
        } else if (inner === '{') {
          depth++;
          i++;
        } else if (inner === '}') {
          depth--;
          i++;
        } else {
          i++;
        }
      }
      continue;
    }
    i++;
  }
  return i;
}

/**
 * @param {string} code
 * @param {number} start - index of the opening '/'
 * @returns {number} index just past the flags, or -1 if this is not a regex
 */
function scanRegex(code, start) {
  let i = start + 1;
  let inCharClass = false;
  while (i < code.length) {
    const char = code[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    // Regex literals cannot span lines; treat this '/' as division instead.
    if (char === '\n' || char === '\r') {
      return -1;
    }
    if (inCharClass) {
      if (char === ']') {
        inCharClass = false;
      }
    } else if (char === '[') {
      // A character class may legally contain an unescaped '/'.
      inCharClass = true;
    } else if (char === '/') {
      i++;
      while (i < code.length && REGEX_FLAG.test(code[i])) {
        i++;
      }
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Whether a '/' in this position opens a regex literal rather than dividing.
 *
 * The ')' case is the interesting one. "(a + b) / 2" divides, but
 * "if (a) /re/.test(b)" does not - and the two look identical from the ')'
 * alone. What separates them is the keyword that opened the group, so the
 * scanner remembers it rather than trying to re-derive it here.
 *
 * @param {string} lastChar - last emitted character
 * @param {string} lastWord - last emitted token, if it was a word
 * @param {boolean} lastParenWasControlFlow - the group just closed belonged to
 *   if/for/while/with/switch/catch
 */
function regexCanFollow(lastChar, lastWord, lastParenWasControlFlow) {
  if (!lastChar) {
    return true;
  }
  if (lastWord && REGEX_AFTER_KEYWORD.has(lastWord)) {
    return true;
  }
  if (lastChar === ')') {
    return lastParenWasControlFlow;
  }
  // An identifier, number, string or subscript ends a value, so '/' divides.
  if (isWordChar(lastChar) || lastChar === ']') {
    return false;
  }
  return true;
}

/** Whether dropping whitespace between two tokens would merge them. */
function tokensWouldMerge(prev, next) {
  if (!prev || !next) {
    return false;
  }
  if (isWordChar(prev) && isWordChar(next)) {
    return true;
  }
  // '+ +' would become '++', and 'a - -b' would become 'a--b'.
  if ((prev === '+' || prev === '-') && (next === '+' || next === '-')) {
    return true;
  }
  // Would open a comment.
  if (prev === '/' && (next === '/' || next === '*')) {
    return true;
  }
  // Would open an HTML-style comment, which JS treats as a line comment.
  if (prev === '<' && next === '!') {
    return true;
  }
  // '1 .toString()' must not become '1.toString()'.
  if (next === '.' && prev >= '0' && prev <= '9') {
    return true;
  }
  return false;
}

/** Whether a newline between two tokens is redundant and can be dropped. */
function newlineIsRedundant(prev, next) {
  if (!prev) {
    return true;
  }
  return EXPRESSION_CONTINUES_AFTER.has(prev) || EXPRESSION_CONTINUES_BEFORE.has(next);
}

/**
 * JavaScript minifier built on a single left-to-right scan.
 *
 * Every construct that can contain characters meaning something else - comments,
 * strings, template literals, regex literals - is consumed whole and emitted
 * verbatim, so nothing inside one is ever reinterpreted. Only the code between
 * them has whitespace removed.
 *
 * Newlines survive wherever they could terminate a statement, which keeps
 * automatic semicolon insertion intact. Whitespace is dropped only when the two
 * tokens either side cannot merge into a different token.
 *
 * Regex and division are told apart from the preceding token, including the
 * ')' case: the scanner records whether each group was opened by a control-flow
 * keyword, so `if (a) /re/.test(b)` reads as a regex and `(a + b) / 2` does not.
 *
 * @param {string} code - The JavaScript code to minify
 * @returns {string} - Minified JavaScript code
 */
function advancedMinifyJavaScript(code) {
  let out = '';
  let lastChar = '';
  let lastWord = '';
  let pendingSpace = false;
  let pendingNewline = false;
  // Whether each open group belongs to if/for/while/with/switch/catch, and what
  // the most recently closed one was.
  const parenIsControlFlow = [];
  let lastParenWasControlFlow = false;
  let i = 0;

  const write = (token, isWord = false) => {
    if (out.length > 0 && (pendingSpace || pendingNewline)) {
      if (pendingNewline && !newlineIsRedundant(lastChar, token[0])) {
        out += '\n';
      } else if (tokensWouldMerge(lastChar, token[0])) {
        out += ' ';
      }
    }
    out += token;
    lastChar = token[token.length - 1];
    lastWord = isWord ? token : '';
    pendingSpace = false;
    pendingNewline = false;
  };

  while (i < code.length) {
    const char = code[i];

    if (char === '\n' || char === '\r') {
      pendingNewline = true;
      i++;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\f' || char === '\v') {
      pendingSpace = true;
      i++;
      continue;
    }

    // Line comment - the terminating newline is handled on the next pass.
    if (char === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n' && code[i] !== '\r') {
        i++;
      }
      pendingSpace = true;
      continue;
    }

    // Block comment - counts as a newline if it spanned one.
    if (char === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) {
        // Everything after it would be silently discarded as comment text.
        throw new Error('unterminated block comment');
      }
      const stop = end + 2;
      if (code.slice(i, stop).includes('\n')) {
        pendingNewline = true;
      } else {
        pendingSpace = true;
      }
      i = stop;
      continue;
    }

    if (char === "'" || char === '"') {
      const end = scanString(code, i);
      write(code.slice(i, end));
      i = end;
      continue;
    }

    if (char === '`') {
      const end = scanTemplate(code, i);
      write(code.slice(i, end));
      i = end;
      continue;
    }

    if (char === '(') {
      parenIsControlFlow.push(CONTROL_FLOW_KEYWORD.has(lastWord));
      write('(');
      i++;
      continue;
    }

    if (char === ')') {
      lastParenWasControlFlow = parenIsControlFlow.pop() ?? false;
      write(')');
      i++;
      continue;
    }

    if (char === '/' && regexCanFollow(lastChar, lastWord, lastParenWasControlFlow)) {
      const end = scanRegex(code, i);
      if (end !== -1) {
        write(code.slice(i, end));
        i = end;
        continue;
      }
    }

    if (isWordChar(char)) {
      let end = i;
      while (end < code.length && isWordChar(code[end])) {
        end++;
      }
      write(code.slice(i, end), true);
      i = end;
      continue;
    }

    write(char);
    i++;
  }

  return out.trim();
}

/**
 * Fails the build rather than emitting a corrupted bundle.
 *
 * Minified output that is wrong only surfaces in a browser, long after the build
 * reported success. These checks catch the damage that is detectable here.
 *
 * @param {string} original - Source before minification
 * @param {string} minified - Source after minification
 * @param {'js' | 'css' | 'html'} fileType
 */
function assertMinifiedIsSane(original, minified, fileType) {
  // A source file that is nothing but comments legitimately minifies to nothing -
  // the default header.html template is exactly that - so only treat empty output
  // as damage when the input had something other than comments in it.
  const withoutComments =
    fileType === 'html'
      ? original.replace(/<!--[\s\S]*?-->/g, '')
      : original.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (withoutComments.trim().length > 0 && minified.trim().length === 0) {
    throw new Error('minifier produced empty output from non-empty input');
  }

  if (fileType === 'js') {
    try {
      // Syntax check only - never executed.
      new Function(minified);
    } catch (error) {
      throw new Error(`minified JavaScript is not parseable: ${error.message}`);
    }
    return;
  }

  if (fileType === 'css') {
    let depth = 0;
    for (const char of minified) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth < 0) {
          throw new Error('minified CSS closes a block that was never opened');
        }
      }
    }
    if (depth !== 0) {
      throw new Error(`minified CSS has ${depth} unclosed block(s)`);
    }
    return;
  }

  if (fileType === 'html') {
    // Tag count is preserved: minification never adds or drops elements.
    const countTags = (text) => (text.match(/<[A-Za-z/][^>]*>/g) ?? []).length;
    const before = countTags(original.replace(/<!--[\s\S]*?-->/g, ''));
    const after = countTags(minified.replace(/<!--[\s\S]*?-->/g, ''));
    if (before !== after) {
      throw new Error(`minified HTML has ${after} tags, expected ${before}`);
    }
  }
}

/**
 * Converts JavaScript, CSS, or HTML file to TypeScript constant
 * @param {string} inputFilePath - Path to the input file
 * @param {string} outputFilePath - Path to the output TypeScript file
 * @param {string} constantName - Name of the constant to create
 * @param {boolean} minify - Whether to minify the code
 * @param {'js' | 'css' | 'html'} fileType - Type of file: 'js', 'css', or 'html'
 */
export function minifyFile(inputFilePath, outputFilePath, constantName, minify, fileType) {
  try {
    // Read the input file
    const code = fs.readFileSync(inputFilePath, 'utf8');

    // Process the code based on file type
    let processedCode = code;

    if (minify) {
      if (fileType === 'js') {
        processedCode = advancedMinifyJavaScript(code);
      } else if (fileType === 'css') {
        processedCode = minifyCSS(code);
      } else if (fileType === 'html') {
        processedCode = minifyHTML(code);
      }
      assertMinifiedIsSane(code, processedCode, fileType);
    }

    // Escape for template literal
    const escapedCode = escapeForTemplateLiteral(processedCode);

    // Create the TypeScript content
    const tsContent = `export const ${constantName} = \`${escapedCode}\`;`;

    // Write the TypeScript file
    fs.writeFileSync(outputFilePath, tsContent, 'utf8');

    console.log(`✅ ${fileType.toUpperCase()} Conversion completed successfully!`);
    console.log(`📁 Input: ${inputFilePath}`);
    console.log(`📁 Output: ${outputFilePath}`);
    console.log(`📊 Original size: ${code.length} characters`);
    console.log(`📊 Processed size: ${processedCode.length} characters`);
    // Guarded: an empty source file divided by zero and reported "NaN%".
    const savedPercent =
      code.length > 0 ? (((code.length - processedCode.length) / code.length) * 100).toFixed(1) : '0.0';
    console.log(`💾 Space saved: ${savedPercent}%`);

    // Show analysis for HTML files
    if (fileType === 'html') {
      console.log('\n🔍 HTML Analysis:');
      const tags = (processedCode.match(/<\w+/g) || []).length;
      const attributes = (processedCode.match(/\w+\s*=/g) || []).length;
      const comments =
        (code.match(/<!--[\s\S]*?-->/g) || []).length - (processedCode.match(/<!--[\s\S]*?-->/g) || []).length;

      console.log(`🏷️  Tags: ${tags}`);
      console.log(`⚙️  Attributes: ${attributes}`);
      console.log(`💬 Comments removed: ${comments}`);
    }

    return { originalSize: code.length, processedSize: processedCode.length };
  } catch (error) {
    // Throw rather than exit. This module is bundled into `npx nooxy generate`
    // and runs in the user's project, where process.exit(1) abandoned every
    // remaining asset — edit head.js and head.css together, mistype the JS, and
    // the CSS silently kept its old content. It also made the CLI's own
    // try/catch, failure counter and exit code unreachable.
    //
    // Reporting is left to the caller so the message is not printed twice.
    throw new Error(`${fileType.toUpperCase()} conversion failed: ${error.message}`, { cause: error });
  }
}
