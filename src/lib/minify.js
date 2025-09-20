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

  // Restore URLs
  urlStore.forEach(({ placeholder, url }) => {
    minified = minified.replace(placeholder, url);
  });

  // Restore strings
  stringStore.forEach(({ placeholder, string }) => {
    minified = minified.replace(placeholder, string);
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

  // Restore all protected content
  protectedContent.forEach(({ placeholder, content }) => {
    minified = minified.replace(placeholder, content);
  });

  return minified;
}

/**
 * Advanced JavaScript minifier with better regex handling
 * @param {string} code - The JavaScript code to minify
 * @returns {string} - Minified JavaScript code
 */
function advancedMinifyJavaScript(code) {
  // Store regex patterns temporarily to avoid breaking them
  const regexPatterns = [];
  let regexIndex = 0;
  let jsCode = code;
  // Extract and store regex patterns
  jsCode = jsCode.replace(/\/(?![*\/])(?:[^\/\\\n\r]|\\.)*(\/[gimuy]*)/g, (match) => {
    const placeholder = `__REGEX_${regexIndex++}__`;
    regexPatterns.push({ placeholder, pattern: match });
    return placeholder;
  });

  // Extract and store string literals to protect them
  const strings = [];
  let stringIndex = 0;

  // Handle single and double quoted strings
  jsCode = jsCode.replace(/(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/g, (match) => {
    const placeholder = `__STRING_${stringIndex++}__`;
    strings.push({ placeholder, string: match });
    return placeholder;
  });

  // Now minify the code
  let minified = jsCode
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Remove spaces around operators and punctuation
    .replace(/\s*([{}();,:\[\]])\s*/g, '$1')
    // Remove spaces around operators
    .replace(/\s*([=!<>+\-*/%&|^])\s*/g, '$1')
    // Clean up
    .trim();

  // Restore strings
  strings.forEach(({ placeholder, string }) => {
    minified = minified.replace(placeholder, string);
  });

  // Restore regex patterns
  regexPatterns.forEach(({ placeholder, pattern }) => {
    minified = minified.replace(placeholder, pattern);
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
