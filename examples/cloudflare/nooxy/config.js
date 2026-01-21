import { HEAD_JS_STRING } from './generated/_head-js-string.js';
import { BODY_JS_STRING } from './generated/_body-js-string.js';
import { HEAD_CSS_STRING } from './generated/_head-css-string.js';
import { HEADER_HTML_STRING } from './generated/_header-html-string.js';

/** @type {import('nooxy').NooxySiteConfig} */
export const SITE_CONFIG = {
  // ============================================================================
  // REQUIRED: Basic Site Configuration
  // ============================================================================

  // Your custom domain (without https://)
  // Example: 'example.com' or 'docs.example.com'
  domain: 'your-domain.com',

  // Map URL slugs to Notion page IDs
  // The '/' slug is your homepage
  // Get page ID from Notion: Share > Copy link > extract the 32-char ID
  // Example: https://notion.so/My-Page-abc123... -> 'abc123...' (32 chars)
  slugToPage: {
    '/': 'NOTION_HOME_PAGE_ID',
    // '/about': 'NOTION_PAGE_ID',
    // '/contact': 'NOTION_PAGE_ID',
    // Use '/' in slug for nested pages:
    // '/docs/getting-started': 'NOTION_PAGE_ID',
  },

  // Site name displayed in browser tabs and social previews
  // Used for og:site_name meta tag
  siteName: 'Your Site Name',

  // Your Notion workspace domain (without https://)
  // Find it in your Notion page URL: https://YOUR-WORKSPACE.notion.site/...
  // This prevents serving unintended Notion content through your domain
  notionDomain: 'your-workspace.notion.site',

  // ============================================================================
  // OPTIONAL: Social Media & Branding
  // ============================================================================

  // Twitter/X handle for twitter:site meta tag (include @)
  // Shows "via @handle" when your page is shared on Twitter
  // twitterHandle: '@yourhandle',

  // Custom favicon URL (must be .ico format)
  // If not set, uses Notion's default favicon
  // siteIcon: 'https://example.com/favicon.ico',

  // ============================================================================
  // OPTIONAL: Page-Specific Metadata
  // ============================================================================

  // Override meta tags for specific pages
  // Key: Notion page ID (32 chars), Value: metadata object
  // Useful for custom titles/descriptions on important pages
  // pageMetadata: {
  //   'NOTION_PAGE_ID': {
  //     title: 'Custom Page Title',           // <title> and og:title
  //     description: 'Custom description',    // meta description and og:description
  //     image: 'https://example.com/img.jpg', // og:image and twitter:image
  //     author: 'Author Name',                // article:author meta tag
  //   },
  // },

  // ============================================================================
  // OPTIONAL: 404 Page
  // ============================================================================

  // Custom 404 page from Notion
  // If not set, visitors see a generic 404 page
  // fof: {
  //   page: 'NOTION_404_PAGE_ID',  // Your custom 404 page ID
  //   slug: '/404',                // URL path (default: '/404')
  // },

  // ============================================================================
  // OPTIONAL: Subdomain Redirects
  // ============================================================================

  // Redirect subdomains to your main domain
  // Common use: redirect www to non-www (or vice versa)
  // subDomains: {
  //   www: {
  //     redirect: 'https://example.com',  // Redirects www.example.com -> example.com
  //   },
  // },

  // ============================================================================
  // OPTIONAL: Typography & Analytics
  // ============================================================================

  // Google Font name from https://fonts.google.com
  // Applies to all text on your site
  // googleFont: 'Inter',
  // googleFont: 'Roboto',
  // googleFont: 'Open Sans',

  // Google Analytics 4 Measurement ID
  // Find it: GA4 > Admin > Data Streams > your stream > Measurement ID
  // Format: 'G-XXXXXXXXXX'
  // googleTagID: 'G-XXXXXXXXXX',

  // ============================================================================
  // OPTIONAL: SEO Configuration
  // ============================================================================

  // seo: {
  //   // Enable/disable search engine indexing
  //   // true (default): Removes Notion's noindex, adds canonical URLs, allows crawling
  //   // false: Keeps noindex, hides site from search engines
  //   indexing: true,
  //
  //   // Canonical domain for SEO
  //   // Use when nooxy runs on a subdomain but SEO should point to main domain
  //   // Example: Site on 'docs.example.com' but canonical URLs point to 'example.com'
  //   // All og:url, twitter:url, canonical tags, and sitemap URLs use this domain
  //   // canonicalDomain: 'example.com',
  //
  //   // Path mapping for canonical domain
  //   // Maps paths from your nooxy domain to the canonical domain
  //   // Example: 'docs.example.com/' -> 'example.com/docs'
  //   // canonicalPathMap: {
  //   //   '/': '/docs',
  //   //   '/guide': '/docs/guide',
  //   // },
  //
  //   // Meta keywords for SEO (comma-separated)
  //   // Adds <meta name="keywords"> tag
  //   // keywords: 'keyword1, keyword2, keyword3',
  //
  //   // Default author for all pages
  //   // Used when page-specific author isn't set in pageMetadata
  //   // Adds <meta name="author"> and article:author tags
  //   // defaultAuthor: 'Your Name',
  //
  //   // Replace "Notion" branding in meta tags
  //   // Notion adds "Notion" to various meta tags by default
  //   // This replaces all occurrences with your brand name
  //   // If not set, uses siteName value
  //   // brandReplacement: 'Your Brand',
  //
  //   // AI attribution meta tags
  //   // Helps AI systems (ChatGPT, Claude, Perplexity) properly credit your content
  //   // Adds: <meta name="ai:source_url"> and <meta name="ai:source_attribution">
  //   // aiAttribution: 'Your Name - example.com',
  // },

  // ============================================================================
  // OPTIONAL: Nooxy Configuration
  // ============================================================================

  // nooxy: {
  //   // Show "Made with Nooxy" badge in header
  //   // Default: true - set to false to hide the badge
  //   showBadge: true,
  // },

  // ============================================================================
  // ADVANCED: Custom Code Injection
  // ============================================================================

  // Custom CSS injected into <head>
  // Use for styling overrides, hiding Notion elements, custom themes
  // Edit: ./generated/_head-css-string.js
  customHeadCSS: HEAD_CSS_STRING,

  // Custom JavaScript injected into <head>
  // Runs before page content loads
  // Edit: ./generated/_head-js-string.js
  customHeadJS: HEAD_JS_STRING,

  // Custom JavaScript injected before </body>
  // Runs after page content loads
  // Edit: ./generated/_body-js-string.js
  customBodyJS: BODY_JS_STRING,

  // Custom HTML injected into header area
  // Use for navigation bars, announcement banners, etc.
  // Edit: ./generated/_header-html-string.js
  customHeader: HEADER_HTML_STRING,
};
