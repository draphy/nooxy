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

export async function rewriteHtml(res: Response, url: URL, config: NooxySiteConfigFull, protocol: string) {
  const { HTMLRewriter } = await getHTMLRewriter()

  return new HTMLRewriter()
    .on('title', new MetaRewriter(config, url, protocol))
    .on('meta', new MetaRewriter(config, url, protocol))
    .on('head', new HeadRewriter(config))
    .on('body', new BodyRewriter(config, protocol))
    .transform(res)
}

export const getUrlState = (url: string) => {
  const urlObj = new URL(url)
  const isLocalhost = checkLocalhost(urlObj.hostname)
  return {
    isLocalhost,
    protocol: urlObj.protocol,
    port: urlObj.port,
    domain: isLocalhost ? `${urlObj.hostname}:${urlObj.port}` : urlObj.hostname,
  }
}

export const checkLocalhost = (hostname: string) => localhost.includes(hostname)
const localhost = ['localhost', '127.0.0.1', '::1']
