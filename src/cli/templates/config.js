import { googleTag } from 'nooxy'
import { BODY_JS_STRING } from './generated/body-js-string.js'
import { HEAD_CSS_STRING } from './generated/head-css-string.js'

// Set this to your Google Tag ID from Google Analytics
const GOOGLE_TAG_ID = ''

/** @type {import('nooxy').NooxySiteConfig} */
export const SITE_CONFIG = {
  domain: 'your-domain.com',

  // Metatags, optional
  // For main page link preview
  siteName: 'Your Site Name',
  siteDescription: 'Your site description for SEO',
  siteImage: 'Your site image icon url',

  // Twitter handle, optional
  // twitterHandle: '',

  // URL to custom favicon.ico
  // siteIcon: '',

  // Additional safety: avoid serving extraneous Notion content from your website
  // Use the value from your Notion settings => Workspace => Settings => Domain
  // notionDomain: '',

  // Map slugs (short page names) to Notion page IDs
  // Empty slug is your main page
  slugToPage: {
    '': 'NOTION_HOME_PAGE_ID',
    // contact: 'NOTION_PAGE_ID',
    // about: 'NOTION_PAGE_ID',
    // // Hint: you can use '/' in slug name to create subpages
    // 'about/people': 'NOTION_PAGE_ID',
  },

  // Rewrite meta tags for specific pages
  // Use the Notion page ID as the key
  // pageMetadata: {
  //   'NOTION_PAGE_ID': {
  //     title: 'My Custom Page Title',
  //     description: 'My custom page description',
  //     image: 'https://imagehosting.com/images/page_preview.jpg',
  //     author: 'My Name',
  //   },
  // },

  // Subdomain redirects are optional
  // But it is recommended to have one for www
  subDomains: {
    www: {
      redirect: 'https://your-domain.com',
    },
  },

  // The 404 (not found) page is optional
  // If you don't have one, the default 404 page will be used
  // fof: {
  //   page: "NOTION_PAGE_ID",
  //   slug: "404", // default
  // },

  // Google Font name, you can choose from https://fonts.google.com
  googleFont: 'Roboto',

  // Custom JS for head and body of a Notion page
  customHeadCSS: HEAD_CSS_STRING,
  customHeadJS: googleTag(GOOGLE_TAG_ID), // Add your Google Tag ID here if needed
  customBodyJS: BODY_JS_STRING, // Add your custom body script here if needed
}
