import fs from 'fs';

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

/**
 * CSS minifier that preserves functionality
 * @param {string} code - The CSS code to minify
 * @returns {string} - Minified CSS code
 */
function minifyCSS(code) {
  // Store important content to protect it during minification
  const urlStore = [];
  const stringStore = [];
  let urlCounter = 0;
  let stringCounter = 0;
  let cssCode = code;

  // Protect URLs in CSS (url(...))
  cssCode = cssCode.replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/g, (match) => {
    const placeholder = `__URL_${urlCounter++}__`;
    urlStore.push({ placeholder, url: match });
    return placeholder;
  });

  // Protect string values in CSS
  cssCode = cssCode.replace(/(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/g, (match) => {
    const placeholder = `__STRING_${stringCounter++}__`;
    stringStore.push({ placeholder, string: match });
    return placeholder;
  });

  // Minify CSS
  let minified = cssCode
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove unnecessary whitespace
    .replace(/\s+/g, ' ')
    // Remove spaces around CSS delimiters
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ',')
    // Remove spaces around CSS operators
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*~\s*/g, '~')
    // Remove trailing semicolons before }
    .replace(/;}/g, '}')
    // Clean up
    .trim();

  // Restore URLs (use callback to avoid $ special chars in replacement)
  urlStore.forEach(({ placeholder, url }) => {
    minified = minified.replace(placeholder, () => url);
  });

  // Restore strings (use callback to avoid $ special chars in replacement)
  stringStore.forEach(({ placeholder, string }) => {
    minified = minified.replace(placeholder, () => string);
  });

  return minified;
}

/**
 * HTML minifier that preserves functionality
 * @param {string} code - The HTML code to minify
 * @returns {string} - Minified HTML code
 */
function minifyHTML(code) {
  // Store important content to protect it during minification
  const protectedContent = [];
  let counter = 0;
  let htmlCode = code;
  // Protect script tags content (including inline JavaScript)
  htmlCode = htmlCode.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match) => {
    const placeholder = `__PROTECTED_${counter++}__`;
    protectedContent.push({ placeholder, content: match });
    return placeholder;
  });

  // Protect style tags content (including inline CSS)
  htmlCode = htmlCode.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match) => {
    const placeholder = `__PROTECTED_${counter++}__`;
    protectedContent.push({ placeholder, content: match });
    return placeholder;
  });

  // Protect pre, code, and textarea tags (preserve whitespace)
  htmlCode = htmlCode.replace(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    const placeholder = `__PROTECTED_${counter++}__`;
    protectedContent.push({ placeholder, content: match });
    return placeholder;
  });

  // Protect attribute values (quoted strings)
  htmlCode = htmlCode.replace(/(\w+\s*=\s*)(['"])((?:(?!\2)[^\\]|\\.)*)(\2)/g, (match) => {
    const placeholder = `__PROTECTED_${counter++}__`;
    protectedContent.push({ placeholder, content: match });
    return placeholder;
  });

  // Minify HTML
  let minified = htmlCode
    // Remove HTML comments (but preserve conditional comments)
    .replace(/<!--(?!\s*(?:\[if|<!\[endif))([\s\S]*?)-->/g, '')
    // Remove unnecessary whitespace between tags
    .replace(/>\s+</g, '><')
    // Remove whitespace around specific tags
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Remove spaces around = in attributes (will be restored)
    .replace(/\s*=\s*/g, '=');
  // Remove quotes around simple attribute values (be careful with this)
  // .replace(/=(['"])([\w-]+)\1/g, '=$2') // Commented out for safety

  // Restore all protected content (use callback to avoid $ special chars)
  protectedContent.forEach(({ placeholder, content }) => {
    minified = minified.replace(placeholder, () => content);
  });

  return minified;
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
function advancedMinifyJavaScript(code) {
  let jsCode = code;

  // STEP 1: Extract and protect string literals FIRST
  // This prevents "https://" inside strings from being treated as comments
  const strings = [];
  let stringIndex = 0;

  // Handle single and double quoted strings (including escaped quotes)
  jsCode = jsCode.replace(/(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/g, (match) => {
    const placeholder = `__STRING_${stringIndex++}__`;
    strings.push({ placeholder, string: match });
    return placeholder;
  });

  // STEP 2: Extract and protect template literals
  // Handle nested template literals by processing from innermost out
  const templateLiterals = [];
  let templateIndex = 0;

  // Simple template literals without expressions
  jsCode = jsCode.replace(/`(?:[^`\\]|\\.)*`/g, (match) => {
    const placeholder = `__TEMPLATE_${templateIndex++}__`;
    templateLiterals.push({ placeholder, template: match });
    return placeholder;
  });

  // STEP 3: Extract regex patterns BEFORE comment removal
  // This protects regex like /test\// where // at the end would be seen as comment
  // The pattern requires a preceding context char (=, (, [, etc.) so comments
  // like "// path/to/file" won't match (the first / is not preceded by context char,
  // and the second / after "path" is preceded by "h", not a context char)
  const regexPatterns = [];
  let regexIndex = 0;

  // Regex pattern explanation:
  // - (^|...|keywords) - start of line OR preceding context char OR keywords
  // - \s* - optional whitespace
  // - \/ - opening delimiter
  // - (?![*\/]) - not followed by * or / (would be comment)
  // - (?:[^\/\\\n\r]|\\[\s\S])+ - regex body: non-special chars OR escaped anything
  // - \/ - closing delimiter
  // - [gimsuy]* - optional flags
  // Note: keywords (return, throw, case) are included because regex can follow them
  // and we need to extract before the / is mistaken for division operator
  jsCode = jsCode.replace(
    /(^|[(\[=!&|?:;{},]|\b(?:return|throw|case)\b)\s*(\/(?![*\/])(?:[^\/\\\n\r]|\\[\s\S])+\/[gimsuy]*)/gm,
    (_match, prefix, regex) => {
      const placeholder = `__REGEX_${regexIndex++}__`;
      regexPatterns.push({ placeholder, pattern: regex });
      return `${prefix} ${placeholder}`;
    },
  );

  // STEP 4: Remove comments (now safe - strings and regex are protected)
  jsCode = jsCode
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // STEP 5: Minify whitespace and syntax
  let minified = jsCode
    // Collapse all whitespace to single space
    .replace(/\s+/g, ' ')
    // Remove spaces around punctuation
    .replace(/\s*([{}();,:\[\]])\s*/g, '$1')
    // Remove spaces around operators
    .replace(/\s*([=!<>+\-*/%&|^?])\s*/g, '$1')
    // Add space after keywords only when followed by identifier/literal (not punctuation)
    .replace(/\b(return|throw|new|delete|typeof|void)\b(?=\w)/g, '$1 ')
    // Add space before regex placeholder after return/throw
    .replace(/\b(return|throw|case)\b(__REGEX_)/g, '$1 $2')
    // Clean up
    .trim();

  // STEP 6: Restore in reverse order (LIFO)
  // Use callback functions to avoid $ special chars in replacement strings
  // ($ has special meaning in String.prototype.replace: $&, $`, $', $1, etc.)

  // Restore regex patterns
  regexPatterns.forEach(({ placeholder, pattern }) => {
    minified = minified.replace(placeholder, () => pattern);
  });

  // Restore template literals
  templateLiterals.forEach(({ placeholder, template }) => {
    minified = minified.replace(placeholder, () => template);
  });

  // Restore strings
  strings.forEach(({ placeholder, string }) => {
    minified = minified.replace(placeholder, () => string);
  });

  return minified;
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
    console.log(`💾 Space saved: ${(((code.length - processedCode.length) / code.length) * 100).toFixed(1)}%`);

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
    console.error(`❌ Error during ${fileType.toUpperCase()} conversion:`, error.message);
    process.exit(1);
  }
}
