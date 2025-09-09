#!/usr/bin/env node

import { init } from './init'
import { generate } from './generate'

const command = process.argv[2]

switch (command) {
  case 'init': {
    init()
    generate()
    break
  }
  case 'generate': {
    let customPath: string | undefined = undefined
    for (const arg of process.argv.slice(3)) {
      if (arg.startsWith('--path=')) {
        customPath = arg.slice('--path='.length).replace(/^['"]|['"]$/g, '')
      }
    }
    generate(customPath)
    break
  }
  default:
    console.log('Usage: npx nooxy init or npx nooxy generate')
    process.exit(1)
}
