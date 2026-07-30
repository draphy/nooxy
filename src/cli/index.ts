#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generate } from './generate';
import { init } from './init';

const USAGE = [
  'Usage:',
  '  npx nooxy init                     scaffold nooxy/ and build its assets',
  '  npx nooxy generate [options]       rebuild the assets after an edit',
  '',
  'Options for generate:',
  '  --path=<dir>                       project root (default: current directory)',
  '  --no-minify                        leave the generated assets readable',
  '',
  '  --help, -h                         show this message',
  '  --version, -v                      print the installed nooxy version',
].join('\n');

/**
 * The installed version, for bug reports.
 *
 * Read at runtime rather than inlined at build time so it cannot drift from the
 * package the user actually has. Resolved relative to this module, which sits at
 * dist/cli/index.js, so the manifest is two levels up.
 */
function readVersion(): string {
  try {
    const manifest = fileURLToPath(new URL('../../package.json', import.meta.url));

    return (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Anything unrecognised is reported: a typo such as --no-minfy used to be ignored.
 *
 * Returns null rather than calling process.exit, so the caller decides the exit
 * code the same way it does for every other outcome. process.exit here could
 * also truncate the usage text on a piped stdout.
 */
function parseGenerateArgs(args: string[]): { customPath?: string; shouldMinify: boolean } | null {
  let customPath: string | undefined;
  let shouldMinify = true;

  for (const arg of args) {
    if (arg.startsWith('--path=')) {
      // A shell may leave the quotes on: --path='/some/dir'
      customPath = arg.slice('--path='.length).replace(/^['"]|['"]$/g, '');
    } else if (arg === '--no-minify') {
      shouldMinify = false;
    } else {
      console.error(`⚠️  Unrecognised option: ${arg}`);
      console.error(USAGE);

      return null;
    }
  }

  return { customPath, shouldMinify };
}

async function main(): Promise<number> {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);

    return 0;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(readVersion());

    return 0;
  }

  if (command === 'init') {
    // init takes no options. Accepting them silently meant `nooxy init
    // --path=./somewhere` scaffolded into the current directory instead, with
    // nothing said — the same class of bug parseGenerateArgs already guards.
    if (args.length > 0) {
      console.error(`⚠️  init takes no options, but received: ${args.join(' ')}`);
      console.error(USAGE);

      return 1;
    }

    const scaffolded = init();
    // A template that could not be copied means the package is broken, so there
    // is nothing worth generating from — stop rather than compounding the error.
    if (scaffolded.failed > 0) {
      return 1;
    }

    const result = await generate();

    return result.failed > 0 ? 1 : 0;
  }

  if (command === 'generate') {
    const parsed = parseGenerateArgs(args);
    if (!parsed) {
      return 1;
    }

    const result = await generate(parsed.customPath, parsed.shouldMinify);

    return result.failed > 0 ? 1 : 0;
  }

  // The same USAGE block as --help: a second, shorter version of it drifted from
  // this one and omitted the options entirely.
  console.error(command ? `Unknown command: ${command}` : 'No command given');
  console.error(USAGE);

  return 1;
}

// Awaited so a rejected generate surfaces as a failed command rather than an
// unhandled rejection with a zero exit code. generate's body happens to be
// synchronous today, so no test can currently tell the difference — the await
// is here for when that stops being true.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
