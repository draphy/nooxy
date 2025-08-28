import fs from 'fs'
import path from 'path'

export async function generate() {
  const rootDir = process.cwd()
  const nooxyDir = path.join(rootDir, 'nooxy')
  const generatedDir = path.join(nooxyDir, 'generated')

  // Ensure generated directory exists
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir)
  }

  // File paths
  const bodyJsPath = path.join(nooxyDir, 'body.js')
  const headCssPath = path.join(nooxyDir, 'head.css')
  const headerHtmlPath = path.join(nooxyDir, 'header.html')
  const outBodyJsString = path.join(generatedDir, 'body-js-string.js')
  const outHeadCssString = path.join(generatedDir, 'head-css-string.js')
  const outHeaderHtmlString = path.join(generatedDir, 'header-html-string.js')
  // Read and write body.js
  try {
    const bodyJsContent = fs.readFileSync(bodyJsPath, 'utf8')
    const bodyJsExport = `export const BODY_JS_STRING = \`${bodyJsContent.replace(/`/g, '\u0060')}\`\n`
    fs.writeFileSync(outBodyJsString, bodyJsExport, 'utf8')
    console.log(`✅ Generated ${outBodyJsString}`)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process body.js: ${err.message}`)
  }

  // Read and write head.css
  try {
    const headCssContent = fs.readFileSync(headCssPath, 'utf8')
    const headCssExport = `export const HEAD_CSS_STRING = \`${headCssContent.replace(/`/g, '\u0060')}\`\n`
    fs.writeFileSync(outHeadCssString, headCssExport, 'utf8')
    console.log(`✅ Generated ${outHeadCssString}`)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process head.css: ${err.message}`)
  }

  // Read and write header.html
  try {
    const headerHtmlContent = fs.readFileSync(headerHtmlPath, 'utf8')
    const headerHtmlExport = `export const HEADER_HTML_STRING = \`${headerHtmlContent.replace(/`/g, '\u0060')}\`\n`
    fs.writeFileSync(outHeaderHtmlString, headerHtmlExport, 'utf8')
    console.log(`✅ Generated ${outHeaderHtmlString}`)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (err: any) {
    console.error(`❌ Failed to process header.html: ${err.message}`)
  }
}
