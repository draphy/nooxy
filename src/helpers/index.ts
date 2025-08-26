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
