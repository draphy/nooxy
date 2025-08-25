#!/usr/bin/env node

import { init } from './init'

const command = process.argv[2]

switch (command) {
  case 'init': {
    init()
    break
  }
  case 'generate': {
    console.log('This is generate')
    break
  }
  default:
    console.log('Usage: npx nooxy init or npx nooxy generate')
    process.exit(1)
}
