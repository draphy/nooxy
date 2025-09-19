#!/usr/bin/env node

import { init } from './init';
import { generate } from './generate';

const command = process.argv[2];

switch (command) {
  case 'init': {
    init();
    generate();
    break;
  }
  case 'generate': {
    let customPath: string | undefined = undefined;
    let shouldMinify = true;
    for (const arg of process.argv.slice(3)) {
      if (arg.startsWith('--path=')) {
        customPath = arg.slice('--path='.length).replace(/^['"]|['"]$/g, '');
      }
      if (arg.startsWith('--no-minify')) {
        shouldMinify = false;
      }
    }
    generate(customPath, shouldMinify);
    break;
  }
  default:
    console.log('Usage: npx nooxy init or npx nooxy generate');
    process.exit(1);
}
