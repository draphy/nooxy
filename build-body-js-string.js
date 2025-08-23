#!/usr/bin/env node

import fs from 'fs'

const OUT_FILE = './src/rewriters/_body-js-string.ts'
const BODY_JS_FILE = './src/rewriters/body.js'

try {
  // Read the body.js file
  const bodyJsContent = fs.readFileSync(BODY_JS_FILE, 'utf8')

  // Create the TypeScript content
  const tsContent = `export const BODY_JS_STRING = \`${bodyJsContent}\``

  // Write to the output file
  fs.writeFileSync(OUT_FILE, tsContent, 'utf8')

  console.log(`✅ Generated ${OUT_FILE}`)
} catch (error) {
  console.error('❌ Error generating body JS string:', error.message)
  process.exit(1)
}
