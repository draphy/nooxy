# Nooxy

<div align="center">

<img src="https://raw.githubusercontent.com/draphy/public-assets/main/nooxy/logo.png" alt="Nooxy Logo" width="140" />

**A free, zero dependency Notion Reverse Proxy with advanced customization features**

[![npm version](https://img.shields.io/npm/v/nooxy?style=flat-square)](https://www.npmjs.com/package/nooxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

## 🚀 What is Nooxy?

Nooxy is a modern, open-source, zero dependency Notion reverse proxy that allows you to host your Notion pages on your own custom domain with complete control over customization. Built with TypeScript and designed for Cloudflare Workers and modern Node.js runtimes, Nooxy provides a powerful alternative to Notion's expensive custom domain feature.

### Why Nooxy?

Notion's custom domain feature is expensive and offers limited customization control. Nooxy solves this by providing:

- **💰 Completely Free** - No monthly fees or usage limits
- **📦 Zero Dependencies** - No external dependencies, lightweight and fast
- **🎨 Full Customization** - Inject custom CSS, JavaScript, and HTML with metadata customization
- **🔧 Local Development** - Test your site locally before deployment
- **⚡ High Performance** - Specially Built for Cloudflare Workers edge computing and modern Node.js runtimes
- **🛠️ Developer Friendly** - CLI tools, TypeScript support, and extensive configuration options
- **🔗 Seamless Navigation** - Proper URL rewriting and internal link handling
- **📊 SEO & Metadata** - Advanced metadata customization for better search engine optimization

## ✨ Key Features

### 🏠 **Local Development Support**

Nooxy supports local development with automatic localhost detection:

```typescript
// Automatically detects localhost and adjusts domain
const proxy = initializeNooxy({
  domain: 'your-domain.com', // Will be overridden to localhost:port in dev
  // ... other config
});
```

- Test your Notion site locally before deployment
- Hot reloading and instant feedback
- Debug and iterate quickly

### 📁 **Multiple Configuration Instances**

Supported via `initializeNooxy({ configKey, config })` and a cached `ConfigManager` keyed by `configKey`. This lets you run multiple isolated proxies (e.g., different domains) in the same runtime with independent caches.

```typescript
// Production config
const prodProxy = initializeNooxy({
  configKey: 'production',
  config: productionConfig,
});

// Development config
const devProxy = initializeNooxy({
  configKey: 'development',
  config: developmentConfig,
});

// Usage example in a multi-tenant Worker
export default {
  async fetch(request) {
    const host = new URL(request.url).hostname;
    const proxy = host.endsWith('example.com') ? prodProxy : devProxy;
    return proxy(request);
  },
};

Why it's useful:
- Run multiple domains/sites with a single deployment
- Separate caches for each site via `ConfigManager.getInstance(config, configKey)`
- Easier staging/production side-by-side in one process
```

### 🔗 **Advanced URL Rewriting**

Nooxy provides sophisticated URL rewriting that handles:

- **Internal Links**: All Notion internal links are rewritten to your domain
- **Navigation**: Seamless internal navigation within your custom domain and Browser back/forward buttons work correctly
- **Deep Linking**: Direct links to specific pages work seamlessly
- **Slug Mapping**: Proper slug-to-page mapping with 301 redirects i.e Clean URLs like `/about` map to Notion page IDs

### 🎛️ **CLI Tooling**

- `npx nooxy init` - Initialize configuration files in a `nooxy/` folder at project root
- `npx nooxy generate [--path=/absolute/or/relative/path] [--no-minify]` - Generate minified string files from a custom path (defaults to current working directory). The configuration folder name must be `nooxy`.

### 🎨 **Custom Header Support**

- Inject custom HTML, CSS, and JavaScript into the header
- Complete control over the top navigation bar
- Responsive design with mobile optimization

### ⚡ **Optimized Caching & Performance**

- Smart configuration caching for better performance
- Multiple instance support for different environments
- Efficient memory usage
- **Zero dependencies** for minimal bundle size and fast loading
- **Automatic minification** of custom CSS, JavaScript, and HTML files
- **Advanced minification** that preserves functionality while reducing file sizes

### 🔧 **Advanced Customization**

- **Required custom files**: CSS, JavaScript, and HTML injection for complete control
- Custom CSS injection for styling
- JavaScript injection for functionality (both head and body)
- HTML header customization
- **Metadata customization**: Page-specific SEO metadata, Open Graph tags, Twitter cards, and JSON-LD structured data
- Optional Google Fonts integration
- Optional Google Analytics support

### 🛡️ **Enhanced Security**

- Proper XMLHttpRequest handling
- Blocked problematic Notion requests
- Content Security Policy management

### 📊 **Advanced Metadata Customization**

- **Page-specific SEO**: Customize title, description, and Open Graph tags for each page
- **Social Media Optimization**: Twitter cards and Facebook Open Graph metadata
- **JSON-LD Structured Data**: Automatic generation of structured data for better search visibility
- **SEO Optimization**: Enhanced search engine optimization with customizable meta tags

### 📦 **Zero Dependencies**

- **No External Dependencies**: Zero runtime dependencies for maximum compatibility
- **Minimal Bundle Size**: Ultra-lightweight package for fast loading
- **Security**: No third-party dependencies means fewer security vulnerabilities
- **Reliability**: No dependency conflicts or version mismatches
- **Performance**: Faster cold starts and reduced memory usage
- **Deployment**: Easy deployment to any environment without dependency management

## 📦 Installation

### Prerequisites

- Node.js
- A Cloudflare account (for deployment)
- A custom domain (optional, for production)

### Install Nooxy

```bash
npm install nooxy
# or
pnpm add nooxy
# or
yarn add nooxy
```

**Zero Dependencies**: Nooxy has no runtime dependencies, making it lightweight and fast to install.

## 🚀 Quick Start

### 1. Initialize Your Project

```bash
npx nooxy init
```

This creates a `nooxy` directory with all necessary configuration files:

```
nooxy/
├── config.js          # Main configuration file
├── head.js            # Custom JavaScript for <head>
├── body.js            # Custom JavaScript for <body>
├── head.css           # Custom CSS styles
├── header.html        # Custom HTML header
└── generated/         # Auto-generated files (created after running generate)
    ├── _head-js-string.js
    ├── _body-js-string.js
    ├── _head-css-string.js
    └── _header-html-string.js
```

### 2. Configure Your Site

Edit `nooxy/config.js`:

```javascript
import { HEAD_JS_STRING } from './generated/_head-js-string.js';
import { BODY_JS_STRING } from './generated/_body-js-string.js';
import { HEAD_CSS_STRING } from './generated/_head-css-string.js';
import { HEADER_HTML_STRING } from './generated/_header-html-string.js';

/** @type {import('nooxy').NooxySiteConfig} */
export const SITE_CONFIG = {
  // Site domain, example.com
  domain: 'your-domain.com',

  // Map slugs (short page names) to Notion page IDs
  // '/' slug is your root page
  slugToPage: {
    '/': 'NOTION_HOME_PAGE_ID',
    // '/contact': 'NOTION_PAGE_ID',
    // '/about': 'NOTION_PAGE_ID',
    // Hint: you can use '/' in slug name to create subpages
    // '/about/people': 'NOTION_PAGE_ID',
  },

  // SEO metadata
  siteName: 'Your Site Name',

  // Additional safety: avoid serving extraneous Notion content from your website
  // Use the value from your Notion like example.notion.site
  notionDomain: 'example.notion.site',

  // Optional: Page-specific metadata customization for SEO
  // pageMetadata: {
  //   'NOTION_PAGE_ID': {
  //     title: 'My Custom Page Title',
  //     description: 'My custom page description',
  //     image: 'https://imagehosting.com/images/page_preview.jpg',
  //     author: 'My Name',
  //   },
  // },

  // Optional: 404 page configuration
  // fof: {
  //   page: "NOTION_PAGE_ID",
  //   slug: "404", // default
  // },

  // Optional: Subdomain redirects
  // subDomains: {
  //   www: {
  //     redirect: 'https://your-domain.com',
  //   },
  // },

  // Optional: Google Font and Analytics
  // googleFont: 'Roboto',
  // googleTagID: 'GOOGLE_TAG_ID',

  // Required: Custom JS, CSS, HTML for head and body of a Notion page
  customHeadCSS: HEAD_CSS_STRING,
  customHeadJS: HEAD_JS_STRING,
  customBodyJS: BODY_JS_STRING,
  customHeader: HEADER_HTML_STRING,
};
```

### 3. Generate Required Files

```bash
# Run from project root (where the `nooxy/` folder exists)
npx nooxy generate

# Or specify a custom path that contains the `nooxy/` folder
npx nooxy generate --path=./examples/cloudflare

# Disable minification (optional)
npx nooxy generate --no-minify
```

This reads files from `<path-or-cwd>/nooxy/{head.js,body.js,head.css,header.html}` and converts them into minified string constants under `<path-or-cwd>/nooxy/generated/`. The generated files are automatically minified for optimal performance.

### 4. Deploy to Cloudflare Workers or run in Node.js

Create a Cloudflare Worker and use the following code (Edge runtime):

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';

const proxy = initializeNooxy(SITE_CONFIG);

export default {
  async fetch(request: Request): Promise<Response> {
    return await proxy(request);
  },
} satisfies ExportedHandler<Env>;
```

Or use in a modern Node.js runtime (e.g., express-like frameworks that support `Request`/`Response` or via polyfills):

```ts
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';
import http from 'node:http';

const proxy = initializeNooxy(SITE_CONFIG);

const server = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  const request = new Request(url, { method: req.method });
  const response = await proxy(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
});

server.listen(8787, () =>
  console.log('Nooxy Node server on http://localhost:8787')
);
```

## 📚 Configuration Reference

### Core Configuration

| Field          | Type                     | Required | Description                              |
| -------------- | ------------------------ | -------- | ---------------------------------------- |
| `domain`       | `string`                 | ✅       | Your custom domain (e.g., `example.com`) |
| `siteName`     | `string`                 | ✅       | Site name for SEO and social sharing     |
| `slugToPage`   | `Record<string, string>` | ✅       | Mapping of URL slugs to Notion page IDs  |
| `notionDomain` | `string`                 | ✅       | Your Notion workspace domain             |

### Required Customization

| Field           | Type     | Required | Description                    |
| --------------- | -------- | -------- | ------------------------------ |
| `customHeadCSS` | `string` | ✅       | Custom CSS for `<head>`        |
| `customHeadJS`  | `string` | ✅       | Custom JavaScript for `<head>` |
| `customBodyJS`  | `string` | ✅       | Custom JavaScript for `<body>` |
| `customHeader`  | `string` | ✅       | Custom HTML header content     |

### Optional Configuration

| Field           | Type                                | Required | Description                                    |
| --------------- | ----------------------------------- | -------- | ---------------------------------------------- |
| `pageMetadata`  | `Record<string, PageMetadata>`      | ❌       | Page-specific metadata customization for SEO   |
| `siteIcon`      | `string`                            | ❌       | Custom favicon URL                             |
| `twitterHandle` | `string`                            | ❌       | X (formerly Twitter) handle for social sharing |
| `subDomains`    | `Record<string, SubDomainRedirect>` | ❌       | Subdomain redirect configuration               |
| `fof`           | `FofConfig`                         | ❌       | 404 page configuration                         |
| `googleFont`    | `string`                            | ❌       | Google Font family name                        |
| `googleTagID`   | `string`                            | ❌       | Google Analytics measurement ID                |

### Page Metadata Interface

```typescript
interface PageMetadata {
  title?: string; // Page title customization for SEO
  description?: string; // Page description customization for SEO
  image?: string; // Page-specific Open Graph image customization
  author?: string; // Page author metadata customization
}
```

## 🛠️ CLI Commands

### Initialize Configuration

```bash
npx nooxy init
```

Creates the initial configuration files in a `nooxy` directory at the project root. The folder name is fixed to `nooxy`.

### Generate String Files

```bash
npx nooxy generate [--path=/custom/path] [--no-minify]
```

Converts your custom files (`head.js`, `body.js`, `head.css`, `header.html`) into minified importable string constants under `<path-or-cwd>/nooxy/generated/`.

**Options:**

- `--path`: Specify a custom directory path that contains a `nooxy/` folder
- `--no-minify`: Disable automatic minification of generated files

## 🎨 Customization Guide

### Custom CSS Styling

Edit `nooxy/head.css` to add custom styles:

```css
/* Hide Notion's default top bar */
.notion-topbar {
  display: none !important;
}

/* Custom header styling */
.nooxyBadge_4f7c2b1a-demo-topbar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  color: white;
}

/* Custom page styling */
.notion-page-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
```

### Custom JavaScript (body.js)

Edit `nooxy/body.js` for page functionality:

```javascript
// Custom page interactions
document.addEventListener('DOMContentLoaded', function () {
  // Add custom functionality here
  console.log('Nooxy page loaded!');

  // Example: Add smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
```

### Custom Head JavaScript (head.js)

Use `nooxy/head.js` to inject scripts that must load early in the `<head>` (e.g., analytics, tag managers, A/B testing beacons). These run before body scripts:

```javascript
// Example: preload analytics or feature flags
// Runs in <head>
(function () {
  console.log('Head script loaded');
  // e.g., initialize a feature flag SDK
})();
```

### Custom Header HTML

Edit `nooxy/header.html` for custom header content:

```html
<!-- Custom navigation -->
<nav class="custom-nav">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
</nav>

<!-- Custom branding -->
<div class="custom-branding">
  <h1>Your Brand</h1>
</div>
```

### 🚀 **Automatic Minification**

Nooxy automatically minifies your custom files during generation for optimal performance:

- **JavaScript minification**: Removes comments, unnecessary whitespace, and optimizes code
- **CSS minification**: Removes comments, optimizes selectors, and compresses styles
- **HTML minification**: Removes unnecessary whitespace while preserving functionality
- **Smart preservation**: Protects important content like URLs, strings, and script tags
- **Size reduction**: Typically achieves 20-40% file size reduction

To disable minification, use the `--no-minify` flag:

```bash
npx nooxy generate --no-minify
```

### 📊 **Metadata Customization**

Nooxy provides advanced metadata customization for better SEO and social media sharing:

#### Page-Specific Metadata

Configure custom metadata for individual pages using the `pageMetadata` option:

```javascript
// In your config.js
export const SITE_CONFIG = {
  // ... other config
  pageMetadata: {
    NOTION_PAGE_ID: {
      title: 'Custom Page Title - Your Site',
      description: 'Custom page description for SEO',
      image: 'https://your-domain.com/custom-og-image.jpg',
      author: 'Your Name',
    },
  },
};
```

#### SEO Benefits

- **Search Engine Optimization**: Custom titles and descriptions for better search rankings
- **Social Media Sharing**: Custom Open Graph images and descriptions for Twitter, Facebook, LinkedIn
- **Structured Data**: Automatic JSON-LD generation for rich snippets
- **Dynamic Content**: Real-time metadata rewriting based on page content

#### Supported Metadata

- **Title Tags**: Custom page titles for search engines
- **Meta Descriptions**: Custom descriptions for search results
- **Open Graph**: Facebook, LinkedIn sharing optimization
- **Twitter Cards**: Twitter sharing optimization
- **Author Information**: Page author metadata
- **Custom Images**: Page-specific social media images

## 🏗️ Architecture Overview

### Core Components

```
src/
├── index.ts              # Main export file
├── proxy.ts              # Core reverse proxy logic
├── types.ts              # TypeScript type definitions
├── helpers/              # Utility functions
│   ├── config-loader.ts  # Configuration management
│   ├── config.ts         # Helper functions
│   └── index.ts          # HTML rewriting utilities
├── handlers/             # Request handlers
│   ├── handle-api.ts     # API request handling
│   ├── handle-app-js.ts  # JavaScript file handling
│   ├── handle-favicon.ts # Favicon handling
│   ├── handle-js.ts      # General JS file handling
│   ├── handle-options.ts # CORS preflight handling
│   ├── handle-other.ts   # Other asset handling
│   └── handle-sitemap.ts # Sitemap generation
├── rewriters/            # HTML content rewriting
│   ├── body-rewriter.ts  # Body content rewriting
│   ├── head-rewriter.ts  # Head content rewriting
│   ├── meta-rewriter.ts  # Meta tag rewriting and metadata customization
│   ├── data-rewriter.ts  # Data rewriting and metadata injection
│   ├── header-rewriter.ts # Header rewriting and metadata handling
│   ├── body.js           # Client-side JavaScript
│   └── _body-js-string.ts # Generated body JS string
└── cli/                  # Command-line interface
    ├── index.ts          # CLI entry point
    ├── init.ts           # Initialize command
    ├── generate.ts       # Generate command
    └── templates/        # Configuration templates
        ├── config.js     # Main config template
        ├── head.js       # Head JS template
        ├── body.js       # Body JS template
        ├── head.css      # CSS template
        └── header.html   # Header HTML template
```

### How It Works

1. **Request Interception**: Nooxy intercepts requests to your custom domain
2. **URL Mapping**: Maps clean URLs to Notion page IDs using your configuration
3. **Content Fetching**: Fetches content from Notion's servers
4. **HTML Rewriting**: Uses HTMLRewriter to modify the content in real-time
5. **Metadata Customization**: Rewrites meta tags, Open Graph, Twitter cards, and JSON-LD structured data
6. **Response Delivery**: Serves the modified content to your visitors

### Notable Differences

Nooxy is inspired by [Fruition](https://github.com/stephenou/fruitionsite) and [NoteHost](https://github.com/velsa/notehost) but, Nooxy adds:

- A maintained TypeScript package API for embedding into different runtimes
- **Zero dependencies** for minimal bundle size and fast deployment
- CLI with `init` (scaffold config) and `generate` (convert custom files to strings), with `--path` support on generate
- Multi-instance configuration with caching keyed by `configKey` for multi-tenant or multi-env setups
- Robust HTML rewriting for head, meta, and body plus helpers for Google Fonts and Analytics
- **Advanced metadata customization** with page-specific SEO, Open Graph, Twitter cards, and JSON-LD structured data
- Client-side navigation and href rewriting that keeps users on your domain and preserves slugs, with XHR guardrails
- Optional custom favicon proxying and automatic sitemap generation
- Local development detection with domain normalization for a smooth localhost experience

## 🤝 Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines, development setup, commit conventions, and PR requirements.

## 🐛 Troubleshooting

### Common Issues

#### 1. "Page Not Found" Error

**Problem**: Your Notion pages return 404 errors.

**Solution**:

- Verify your Notion page IDs are correct
- Ensure your Notion pages are published publicly
- Check that your `notionDomain` is set correctly

#### 2. Custom CSS Not Applied

**Problem**: Your custom CSS isn't being applied.

**Solution**:

- Run `npx nooxy generate` after making CSS changes
- Check that your CSS selectors are specific enough
- Use `!important` for overriding Notion's styles
- Ensure `customHeadCSS` is properly set in your config

#### 3. JavaScript Not Working

**Problem**: Custom JavaScript isn't executing.

**Solution**:

- Ensure your JavaScript is in the correct file (`head.js` or `body.js`)
- Run `npx nooxy generate` after making changes
- Check browser console for errors
- Ensure `customHeadJS` and `customBodyJS` are properly set in your config

#### 4. Configuration Errors

**Problem**: Getting errors about missing required fields.

**Solution**:

- Ensure all required fields are set: `domain`, `siteName`, `slugToPage`, `notionDomain`, `customHeadCSS`, `customHeadJS`, `customBodyJS`, `customHeader`
- Run `npx nooxy generate` to create the required string files
- Check that your `nooxy/` folder contains all template files

#### 5. Local Development Issues

**Problem**: Local development server not working.

**Solution**:

- Ensure you're using Node.js 22.0.0 or higher
- Check that your `wrangler.toml` is configured correctly
- Verify your Notion pages are accessible

### Getting Help

- **GitHub Issues**: [Create an issue](https://github.com/draphy/nooxy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/draphy/nooxy/discussions)
- **Email**: contact@draphy.org

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Fruition**: Inspired by the original Fruition project by [@stephenou](https://github.com/stephenou)
- **NoteHost**: Built upon concepts from [@velsa](https://github.com/velsa)'s NoteHost
- **Community**: Thanks to all contributors and users who help improve Nooxy

## 🌟 Showcase

### Sites Built with Nooxy

- [os.draphy.org](https://os.draphy.org)
- Add your site here (Submit a PR to add your site!)

### Featured Examples

- **Portfolio Sites**: Perfect for developer portfolios and personal websites with metadata customization
- **Documentation**: Great for technical documentation and wikis with SEO optimization
- **Blogs**: Excellent for personal and professional blogs with custom metadata
- **Landing Pages**: Ideal for product landing pages and marketing sites with advanced SEO

## 📊 Performance

Nooxy is built for performance:

- **Edge Computing**: Runs on Cloudflare's global edge network
- **Zero Dependencies**: No external dependencies for minimal bundle size
- **Optimized Caching**: Smart configuration caching reduces overhead
- **Minimal Bundle Size**: Lightweight and fast
- **TypeScript**: Type safety and better performance
- **Metadata Optimization**: Advanced SEO metadata customization for better search rankings

## 📦 Examples

This repository includes runnable examples:

- `examples/cloudflare` - A Cloudflare Workers example integrating Nooxy with `initializeNooxy` and `wrangler` configuration. More runtime examples (e.g., Bun, Node HTTP, Express) will be added soon.

---

<div align="center">

**Made with ❤️ by [David Raphi](https://github.com/draphy)**

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/draphy)
[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/its_draphy)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge)](mailto:contact@draphy.org)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/draphy)

**⭐ Star this repository if you find it useful!**

</div>
