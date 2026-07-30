import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { cwd } from 'process';
import { fileURLToPath } from 'url';

export interface InitResult {
  created: number;
  skipped: number;
  failed: number;
}

/**
 * Scaffolds the nooxy/ folder.
 *
 * Returns a count rather than nothing so the caller can set an exit code: this
 * used to print "initialized successfully" and exit 0 even when every template
 * had failed to copy, which is the first thing a new user runs.
 */
export function init(): InitResult {
  const result: InitResult = { created: 0, skipped: 0, failed: 0 };
  const nooxyDir = join(cwd(), 'nooxy');

  // Get the directory of the current module (ES module compatible)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Create nooxy directory if it doesn't exist
  if (!existsSync(nooxyDir)) {
    mkdirSync(nooxyDir, { recursive: true });
    console.log('✅ Created nooxy directory');
  } else {
    console.log('📁 nooxy directory already exists');
  }

  // Files to copy from templates
  const filesToCopy = [
    { src: 'config.js', dest: 'config.js' },
    { src: 'head.js', dest: 'head.js' },
    { src: 'body.js', dest: 'body.js' },
    { src: 'head.css', dest: 'head.css' },
    { src: 'header.html', dest: 'header.html' },
  ];

  // Copy each file
  for (const file of filesToCopy) {
    const srcPath = join(__dirname, 'templates', file.src);
    const destPath = join(nooxyDir, file.dest);

    // Check if destination file already exists
    if (existsSync(destPath)) {
      console.log(`⚠️  ${file.dest} already exists. Skipping...`);
      result.skipped += 1;
      continue;
    }

    // A template missing from the installed package is a packaging fault, not
    // something the user can fix by rerunning, so report it and carry on with
    // the rest rather than aborting with a stack trace.
    try {
      const content = readFileSync(srcPath, 'utf8');
      writeFileSync(destPath, content, 'utf8');
      console.log(`✅ Created ${file.dest}`);
      result.created += 1;
    } catch (error) {
      console.error(`❌ Could not create ${file.dest}: ${error instanceof Error ? error.message : error}`);
      result.failed += 1;
    }
  }

  if (result.failed > 0) {
    console.error(`\n❌ ${result.failed} of ${filesToCopy.length} files could not be created.`);
    console.error('   This usually means the installed nooxy package is incomplete — try reinstalling.');

    return result;
  }

  console.log('🎉 Nooxy configuration initialized successfully!');
  console.log(`📝 Edit ${join(nooxyDir, 'config.js')} to configure your Notion site`);

  return result;
}
