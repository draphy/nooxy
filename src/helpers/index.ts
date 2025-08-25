import { NooxySiteConfigFull } from '../types'
import { BodyRewriter, HeadRewriter, MetaRewriter } from '../rewriters'

// multi-platform HTMLRewriter
async function getHTMLRewriter() {
  if (typeof HTMLRewriter !== 'undefined') {
    // Cloudflare Workers environment
    return { HTMLRewriter }
  } else {
    // Other environments - load polyfill
    const { HTMLRewriter } = await import('htmlrewriter')
    return { HTMLRewriter }
  }
}

export async function rewriteHtml(res: Response, url: URL, config: NooxySiteConfigFull) {
  const { HTMLRewriter } = await getHTMLRewriter()

  return new HTMLRewriter()
    .on('title', new MetaRewriter(config, url))
    .on('meta', new MetaRewriter(config, url))
    .on('head', new HeadRewriter(config))
    .on('body', new BodyRewriter(config))
    .transform(res)
}

// environment-detector
export const detectEnvironment = () => {
  // Cloudflare Workers - most specific check first
  if (
    typeof globalThis !== 'undefined' &&
    'caches' in globalThis &&
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    typeof (globalThis as any).addEventListener === 'function' &&
    !('Deno' in globalThis) &&
    !('process' in globalThis)
  ) {
    return 'cloudflare'
  }

  // Deno
  if (typeof globalThis !== 'undefined' && 'Deno' in globalThis) {
    return 'deno'
  }

  // Node.js
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'node'
  }

  // Browser
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  if (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).document !== 'undefined') {
    return 'browser'
  }

  return 'unknown'
}
