export type NooxySiteConfig = Omit<NooxySiteConfigFull, 'slugs' | 'pageToSlug'>

export interface NooxySiteConfigFull {
  // Site domain, example.com
  domain: string

  // Mapping from slug to page ID
  slugToPage: Record<string, string>
  // SEO metadata
  pageMetadata?: Record<string, NooxySiteConfigPageMetadata>
  // og:site_name
  siteName: string
  // twitter:site
  twitterHandle?: string

  // URL to custom favicon.ico
  siteIcon?: string

  // Additional safety: avoid serving extraneous Notion content from your website
  // Use the value from your Notion like example.notion.site
  notionDomain: string

  // 404 Notion page to display to visitors, the default slug is '/404'
  fof?: {
    page: string | undefined
    slug: string | undefined
  }

  subDomains?: Record<string, NooxySiteConfigSubDomainRedirect>

  // Google Font name, you can choose from https://fonts.google.com
  googleFont?: string
  googleTagID?: string

  // Custom CSS/JS to be injected in <head> and <body>
  customHeadCSS: string
  customHeadJS: string
  customBodyJS: string
  customHeader: string

  // SEO configuration
  seo?: NooxySeoConfig

  // Calculated fields
  pageToSlug: Record<string, string>
  slugs: Array<string>
}

// SEO configuration
export interface NooxySeoConfig {
  // Enable search engine indexing (removes noindex, adds canonical URL, adds robots meta)
  // Default: true
  indexing?: boolean

  // Canonical domain - if set, all SEO URLs (canonical, og:url, etc.) point to this domain
  // Useful when nooxy runs on a subdomain but SEO should point to main domain
  // Example: nooxy on "os.example.com" but canonical URLs point to "example.com"
  canonicalDomain?: string

  // Path mapping for canonical domain
  // Maps paths from nooxy domain to canonical domain
  // Example: { '/': '/home' } means os.example.com/ -> example.com/home
  canonicalPathMap?: Record<string, string>

  // Meta keywords for SEO
  keywords?: string

  // Default author for pages without specific author in pageMetadata
  defaultAuthor?: string

  // Replace "Notion" branding in meta tags with custom value
  // Default: uses siteName
  brandReplacement?: string

  // AI crawler attribution - adds ai:source_url and ai:source_attribution meta tags
  // Helps AI systems (ChatGPT, Claude, etc.) properly attribute content
  aiAttribution?: string
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