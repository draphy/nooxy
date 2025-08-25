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
    generate()
    break
  }
  default:
    console.log('Usage: npx nooxy init or npx nooxy generate')
    process.exit(1)
}
