#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { minifyFile } from './src/lib/minify.js';

// Main execution
function main() {
  const rootDir = process.cwd();
  const rewritersDir = path.join(rootDir, 'src/rewriters/custom');
  const generatedDir = path.join(rewritersDir, 'generated');

  // JavaScript conversion
  const headJsPath = path.join(rewritersDir, 'head.js');
  const outHeadJsString = path.join(generatedDir, '_head-js-string.ts');
  const jsConstantName = 'HEAD_JS_STRING';

  // CSS conversion
  const headCssPath = path.join(rewritersDir, 'head.css');
  const outHeadCssString = path.join(generatedDir, '_head-css-string.ts');
  const cssConstantName = 'HEAD_CSS_STRING';

  const shouldMinify = true;

  // Create output directory if it doesn't exist
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  let jsStats = null;
  let cssStats = null;

  // Convert JavaScript file if it exists
  if (fs.existsSync(headJsPath)) {
    console.log('🔄 Processing JavaScript file...');
    jsStats = minifyFile(headJsPath, outHeadJsString, jsConstantName, shouldMinify, 'js');
  } else {
    console.log(`⚠️  JavaScript file not found: ${headJsPath}`);
  }

  // Convert CSS file if it exists
  if (fs.existsSync(headCssPath)) {
    console.log('\n🔄 Processing CSS file...');
    cssStats = minifyFile(headCssPath, outHeadCssString, cssConstantName, shouldMinify, 'css');
  } else {
    console.log(`⚠️  CSS file not found: ${headCssPath}`);
  }

  // Summary
  console.log('\n📋 Summary:');
  if (jsStats) {
    console.log(`📄 JavaScript: ${jsStats.originalSize} → ${jsStats.processedSize} chars`);
  }
  if (cssStats) {
    console.log(`🎨 CSS: ${cssStats.originalSize} → ${cssStats.processedSize} chars`);
  }

  const totalOriginal = (jsStats?.originalSize || 0) + (cssStats?.originalSize || 0);
  const totalProcessed = (jsStats?.processedSize || 0) + (cssStats?.processedSize || 0);

  if (totalOriginal > 0) {
    console.log(
      `🎯 Total: ${totalOriginal} → ${totalProcessed} chars (${(
        ((totalOriginal - totalProcessed) / totalOriginal) * 100
      ).toFixed(1)}% saved)`,
    );
  }
}

// minifyFile throws on a malformed asset rather than exiting, so the build has
// to report it. Without this the failure would surface as a raw stack trace.
try {
  main();
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
