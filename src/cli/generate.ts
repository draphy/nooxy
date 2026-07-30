import fs from 'fs';
import path from 'path';
import { minifyFile } from '../lib/minify';

/** The four assets `nooxy/config.js` imports, in the order they are reported. */
const ASSETS = [
  { source: 'head.js', output: '_head-js-string.js', constant: 'HEAD_JS_STRING', type: 'js', label: 'JavaScript' },
  { source: 'body.js', output: '_body-js-string.js', constant: 'BODY_JS_STRING', type: 'js', label: 'JavaScript' },
  { source: 'head.css', output: '_head-css-string.js', constant: 'HEAD_CSS_STRING', type: 'css', label: 'CSS' },
  {
    source: 'header.html',
    output: '_header-html-string.js',
    constant: 'HEADER_HTML_STRING',
    type: 'html',
    label: 'HTML',
  },
] as const;

export interface GenerateResult {
  generated: number;
  missing: number;
  failed: number;
}

/**
 * Rebuilds the injected assets from the files in `nooxy/`.
 *
 * @param customPath - project root; defaults to the working directory
 * @param shouldMinify - false leaves the output readable
 */
export async function generate(customPath?: string, shouldMinify = true): Promise<GenerateResult> {
  const rootDir = customPath ? path.resolve(customPath) : process.cwd();
  const nooxyDir = path.join(rootDir, 'nooxy');
  const generatedDir = path.join(nooxyDir, 'generated');

  const result: GenerateResult = { generated: 0, missing: 0, failed: 0 };

  // Checked before anything is created. mkdirSync(recursive) used to build
  // `nooxy/generated/` inside whatever directory it was pointed at, so running
  // this from the wrong folder — or with a typo'd --path — left a stray tree
  // behind and still exited 0, which reads as "your changes were applied".
  if (!fs.existsSync(nooxyDir)) {
    console.error(`❌ No nooxy/ folder found in ${rootDir}`);
    console.error('   Run `npx nooxy init` first, or point at the project root with --path=<dir>.');
    result.failed += 1;

    return result;
  }

  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  for (const asset of ASSETS) {
    const sourcePath = path.join(nooxyDir, asset.source);
    const outputPath = path.join(generatedDir, asset.output);

    if (!fs.existsSync(sourcePath)) {
      // The constant is still written, empty.
      //
      // nooxy/config.js imports all four generated modules unconditionally, so
      // skipping one left that import unresolvable and the whole site failed to
      // start with "Cannot find module" — even though the README documents these
      // four source files as optional. Writing an empty constant makes them
      // genuinely optional, and also clears a stale value left behind when a
      // source file is deleted rather than emptied.
      //
      // Previously a success line was printed here regardless, so the output also
      // claimed to have generated a file that was never written.
      fs.writeFileSync(outputPath, `export const ${asset.constant} = \`\`;\n`, 'utf8');
      console.log(`⚠️  ${asset.label} file not found: ${sourcePath}`);
      console.log(`   Wrote an empty ${asset.constant} so nooxy/config.js still resolves.`);
      result.missing += 1;
      continue;
    }

    try {
      console.log(`🔄 Processing ${asset.label} file...`);
      minifyFile(sourcePath, outputPath, asset.constant, shouldMinify, asset.type);
      console.log(`✅ Generated ${outputPath}`);
      result.generated += 1;
    } catch (error) {
      console.error(`❌ Failed to process ${asset.source}: ${error instanceof Error ? error.message : error}`);
      result.failed += 1;
    }
  }

  return result;
}
