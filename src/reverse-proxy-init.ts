import { NooxySiteConfig, NooxySiteConfigFull } from './types'

export let siteConfig: NooxySiteConfigFull = {} as NooxySiteConfigFull

export function initializeReverseProxy(siteConfigUser: NooxySiteConfig) {
  siteConfig = {
    ...siteConfigUser,
    slugs: [],
    pages: [],
    pageToSlug: {},
  }

  siteConfig.pageMetadata = siteConfig.pageMetadata || {}

  siteConfig.fof = {
    page: siteConfig.fof?.page,
    slug: siteConfig.fof?.slug || '404',
  }

  if (siteConfig.fof.page?.length) {
    siteConfig.slugToPage[siteConfig.fof.slug ?? ''] = siteConfig.fof.page
  }

  // Build helper indexes for worker and for the client (body.js)
  Object.keys(siteConfig.slugToPage).forEach((slug) => {
    const pageId = siteConfig.slugToPage[slug]
    if (pageId?.length) {
      siteConfig.slugs.push(slug)
      siteConfig.pages.push(pageId)
      siteConfig.pageToSlug[pageId] = slug
    }
  })
}
