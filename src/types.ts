export type NooxySiteConfig = Omit<NooxySiteConfigFull, 'slugs' | 'pages' | 'pageToSlug'>

export interface NooxySiteConfigFull {
  // Site domain, example.com
  domain: string

  // Mapping from slug to page ID
  slugToPage: Record<string, string>
  pageMetadata?: Record<string, NooxySiteConfigPageMetadata>

  // SEO metadata
  // title, og:site_name, article:author
  siteName: string
  // description, og:description, twitter:description
  siteDescription: string
  // twitter:site, twitter:creator
  twitterHandle?: string
  // og:image, twitter:image
  siteImage?: string

  // URL to custom favicon.ico
  siteIcon?: string

  // Additional safety: avoid serving extraneous Notion content from your website
  // Use the value from your Notion like example.notion.site
  notionDomain?: string

  // 404 Notion page to display to visitors, the default slug is '404'
  fof?: {
    page: string | undefined
    slug: string | undefined
  }

  subDomains?: Record<string, NooxySiteConfigSubDomainRedirect>

  // Google Font name, you can choose from https://fonts.google.com
  googleFont?: string

  // Custom CSS/JS to be injected in <head> and <body>
  customHeadCSS?: string
  customHeadJS?: string
  customBodyJS?: string

  // Calculated fields
  pageToSlug: Record<string, string>
  slugs: Array<string>
  pages: Array<string>
}

export interface NooxySiteConfigSubDomainRedirect {
  redirect: string
}


// Page SEO metadata
// Overrides site-level metadata
export interface NooxySiteConfigPageMetadata {
  // <title>, og:title and twitter:title
  title?: string
  // description, og:description and twitter:description
  description?: string
  // og:image and twitter:image
  image?: string
  // article:author
  author?: string
}