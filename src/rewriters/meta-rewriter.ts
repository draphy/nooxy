import { NooxySiteConfigFull } from '../types'

export class MetaRewriter {
  siteConfig: NooxySiteConfigFull
  url: URL
  isRootPage: boolean
  protocol: string

  constructor(siteConfig: NooxySiteConfigFull, url: URL, protocol: string) {
    this.siteConfig = siteConfig
    this.url = url
    this.isRootPage = this.siteConfig.pageToSlug[this.url.pathname.slice(1)] === ''
    this.protocol = protocol
  }

  element(element: Element) {
    const { siteName, siteDescription, twitterHandle, siteImage, domain, pageToSlug, pageMetadata } = this.siteConfig
    const page = this.url.pathname.slice(-32)
    const property = element.getAttribute('property') ?? ''
    const name = element.getAttribute('name') ?? ''
    const content = element.getAttribute('content') ?? ''

    if (element.tagName === 'title') {
      const pageTitle = pageMetadata?.[page]?.title ?? removeNotionAds(content)

      element.setInnerContent(pageTitle)
    }

    if (property === 'og:title' || name === 'twitter:title') {
      const pageTitle = pageMetadata?.[page]?.title ?? removeNotionAds(content)

      element.setAttribute('content', pageTitle)
    }

    if (property === 'og:site_name') {
      element.setAttribute('content', siteName)
    }

    if (name === 'article:author') {
      const pageAuthor = pageMetadata?.[page]?.author ?? content

      element.setAttribute('content', pageAuthor)
    }

    if (name === 'description' || property === 'og:description' || name === 'twitter:description') {
      if (this.isRootPage) {
        element.setAttribute('content', siteDescription)
      } else {
        const pageDescription = pageMetadata?.[page]?.description ?? removeNotionAds(content)

        element.setAttribute('content', pageDescription)
      }
    }

    if (property === 'og:url' || name === 'twitter:url') {
      if (this.isRootPage) {
        element.setAttribute('content', `${this.protocol}//${domain}/`)
      } else if (pageToSlug[page]) {
        element.setAttribute('content', `${this.protocol}//${domain}/${pageToSlug[page]}`)
      } else {
        element.setAttribute('content', `${this.protocol}//${domain}/${page}`)
      }
    }

    if (name === 'twitter:site') {
      if (twitterHandle) {
        element.setAttribute('content', `${twitterHandle}`)
      } else {
        element.remove()
      }
    }

    if (property === 'og:image' || name === 'twitter:image') {
      if (this.isRootPage && siteImage) {
        element.setAttribute('content', siteImage)
      } else {
        const pageImage = pageMetadata?.[page]?.image ?? content

        element.setAttribute('content', pageImage)
      }
    }

    if (name === 'apple-itunes-app') {
      element.remove()
    }
  }
}

function removeNotionAds(text: string) {
  return text
    .replace(' | Built with Notion', '')
    .replace(' | Notion', '')
    .replace('Built with Notion, the all-in-one connected workspace with publishing capabilities.', '')
}
