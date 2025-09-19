import fs from 'fs';
import path from 'path';
import { minifyFile } from '../lib/minify';

export async function generate(customPath?: string, shouldMinify = true) {
  const rootDir = customPath ? path.resolve(customPath) : process.cwd();
  const nooxyDir = path.join(rootDir, 'nooxy');
  const generatedDir = path.join(nooxyDir, 'generated');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  // File paths

  // Head JS Conversion
  const headJsPath = path.join(nooxyDir, 'head.js');
  const outHeadJsString = path.join(generatedDir, '_head-js-string.js');
  const HEAD_JS_STRING = 'HEAD_JS_STRING';

  // Body JS Conversion
  const bodyJsPath = path.join(nooxyDir, 'body.js');
  const outBodyJsString = path.join(generatedDir, '_body-js-string.js');
  const BODY_JS_STRING = 'BODY_JS_STRING';

  // Head CSS Conversion
  const headCssPath = path.join(nooxyDir, 'head.css');
  const outHeadCssString = path.join(generatedDir, '_head-css-string.js');
  const HEAD_CSS_STRING = 'HEAD_CSS_STRING';

  // Header HTML Conversion
  const headerHtmlPath = path.join(nooxyDir, 'header.html');
  const outHeaderHtmlString = path.join(generatedDir, '_header-html-string.js');
  const HEADER_HTML_STRING = 'HEADER_HTML_STRING';

  // Read and write head.js
  try {
    if (fs.existsSync(headJsPath)) {
      console.log('🔄 Processing JavaScript file...');
      minifyFile(headJsPath, outHeadJsString, HEAD_JS_STRING, shouldMinify, 'js');
    } else {
      console.log(`⚠️  JavaScript file not found: ${headJsPath}`);
    }
    console.log(`✅ Generated ${outHeadJsString}`);
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process head.js: ${err.message}`);
  }

  // Read and write body.js
  try {
    if (fs.existsSync(bodyJsPath)) {
      console.log('🔄 Processing JavaScript file...');
      minifyFile(bodyJsPath, outBodyJsString, BODY_JS_STRING, shouldMinify, 'js');
    } else {
      console.log(`⚠️  JavaScript file not found: ${bodyJsPath}`);
    }
    console.log(`✅ Generated ${outBodyJsString}`);
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process body.js: ${err.message}`);
  }

  // Read and write head.css
  try {
    if (fs.existsSync(headCssPath)) {
      console.log('🔄 Processing CSS file...');
      minifyFile(headCssPath, outHeadCssString, HEAD_CSS_STRING, shouldMinify, 'css');
    } else {
      console.log(`⚠️  CSS file not found: ${headCssPath}`);
    }
    console.log(`✅ Generated ${outHeadCssString}`);
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process head.css: ${err.message}`);
  }

  // Read and write header.html
  try {
    if (fs.existsSync(headerHtmlPath)) {
      console.log('🔄 Processing HTML file...');
      minifyFile(headerHtmlPath, outHeaderHtmlString, HEADER_HTML_STRING, shouldMinify, 'html');
    } else {
      console.log(`⚠️  HTML file not found: ${headerHtmlPath}`);
    }
    console.log(`✅ Generated ${outHeaderHtmlString}`);
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process header.html: ${err.message}`);
  }
}
