import { rewriteHtml, getUrlState } from './helpers'
import {
  handleApi,
  handleAppJs,
  handleJs,
  handleOptions,
  handleSitemap,
  handleNotionAsset,
  handleFavicon,
} from './handlers'
import { ConfigManager } from './helpers/config-loader'
import { NooxySiteConfig, NooxySiteConfigFull } from './types'

export function initializeNooxy(
  options: NooxySiteConfig | { configKey?: string; config: NooxySiteConfig },
): (request: Request) => Promise<Response> {
  let configKey = 'default'
  let config: NooxySiteConfig

  if ('configKey' in options && 'config' in options) {
    configKey = options.configKey || 'default'
    config = options.config
  } else {
    config = options as NooxySiteConfig
  }

  const configManager = ConfigManager.getInstance(config, configKey)

  return async (request: Request): Promise<Response> => {
    const siteConfig = configManager.getConfig()
    const url = getUrlState(request.url)
    if (url.isLocalhost) {
      siteConfig.domain = url.domain
    }
    return reverseProxy(request, siteConfig)
  }
}

async function reverseProxy(request: Request, siteConfig: NooxySiteConfigFull): Promise<Response> {
  const { domain, slugToPage, siteIcon } = siteConfig

  if (request.method === 'OPTIONS') {
    return handleOptions(request)
  }

  const urlOrgState = getUrlState(request.url)
  const url = new URL(request.url)
  const subDomain = url.hostname.split('.')[0]

  if (url.hostname === domain || urlOrgState.isLocalhost) {
    if (urlOrgState.isLocalhost) {
      url.protocol = 'https:'
      url.port = ''
    }
    url.hostname = siteConfig.notionDomain ? `${siteConfig.notionDomain}.notion.site` : 'www.notion.so'

    // Handle special Notion routes
    if (url.pathname === '/robots.txt') {
      return new Response(`Sitemap: ${urlOrgState.protocol}//${domain}/sitemap.xml`)
    }

    if (url.pathname === '/sitemap.xml') {
      return handleSitemap(siteConfig, urlOrgState.protocol)
    }

    if (url.pathname.startsWith('/app') && url.pathname.endsWith('js')) {
      return handleAppJs(url, siteConfig)
    }

    if (url.pathname.startsWith('/api')) {
      return handleApi(url, request)
    }

    if (url.pathname.endsWith('.js')) {
      return handleJs(url)
    }

    if (url.pathname.endsWith('favicon.ico') && siteIcon) {
      return handleFavicon(siteIcon)
    }

    if (
      url.pathname.startsWith('/_assets') ||
      url.pathname.startsWith('/image') ||
      url.pathname.startsWith('/f/refresh') ||
      url.pathname.match(/\.[a-zA-Z]{2,4}$/)
    ) {
      return handleNotionAsset(url)
    }

    // Handle slugs, from site-config

    const slug = url.pathname.split('/').pop() ?? ''
    const slugHash = url.pathname.slice(-32)
    const page = slugToPage[slug]

    if (page) {
      return Response.redirect(`${urlOrgState.protocol}//${domain}/${page}`, 301)
    } else if (slugHash && slugHash !== slug && slugHash.length === 32) {
      return Response.redirect(`${urlOrgState.protocol}//${domain}/${slugHash}`, 301)
    } else if (slug && slug.length !== 32) {
      if (siteConfig.fof?.page?.length) {
        return Response.redirect(`${urlOrgState.protocol}//${domain}/${siteConfig.fof.page}`, 301)
      } else {
        console.error('!! Page Not found (404)', url.pathname)

        return new Response('Page Not found (404).', { status: 404 })
      }
    }
  } else if (subDomain && siteConfig.subDomains) {
    const sub = siteConfig.subDomains[subDomain]

    if (sub) {
      return Response.redirect(sub.redirect, 301)
    }
  }

  const response = await fetch(url.toString(), {
    body: request.body,
    headers: request.headers,
    method: request.method,
  })
  const ret = new Response(response.body as BodyInit, response)

  ret.headers.delete('Content-Security-Policy')
  ret.headers.delete('X-Content-Security-Policy')

  return rewriteHtml(ret, url, siteConfig, urlOrgState.protocol)
}
