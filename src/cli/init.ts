import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { cwd } from 'process'
import { fileURLToPath } from 'url'

export function init() {
  const nooxyDir = join(cwd(), 'nooxy')

  // Get the directory of the current module (ES module compatible)
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  // Create nooxy directory if it doesn't exist
  if (!existsSync(nooxyDir)) {
    mkdirSync(nooxyDir, { recursive: true })
    console.log('✅ Created nooxy directory')
  } else {
    console.log('📁 nooxy directory already exists')
  }

  // Files to copy from templates
  const filesToCopy = [
    { src: 'config.js', dest: 'config.js' },
    { src: 'body.js', dest: 'body.js' },
    { src: 'head.css', dest: 'head.css' },
  ]

  // Copy each file
  for (const file of filesToCopy) {
    const srcPath = join(__dirname, 'templates', file.src)
    const destPath = join(nooxyDir, file.dest)

    // Check if destination file already exists
    if (existsSync(destPath)) {
      console.log(`⚠️  ${file.dest} already exists. Skipping...`)
      continue
    }

    // Read and copy file
    const content = readFileSync(srcPath, 'utf8')
    writeFileSync(destPath, content, 'utf8')
    console.log(`✅ Created ${file.dest}`)
  }

  console.log('🎉 Nooxy configuration initialized successfully!')
  console.log(`📝 Edit ${join(nooxyDir, 'config.js')} to configure your Notion site`)
}
