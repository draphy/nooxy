# Nooxy

<div align="center">

<img src="https://raw.githubusercontent.com/draphy/public-assets/main/nooxy/logo.png" alt="Nooxy Logo" width="140" />

**A free and powerful Notion Reverse Proxy with advanced customization features**

[![npm version](https://img.shields.io/npm/v/nooxy?style=flat-square)](https://www.npmjs.com/package/nooxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

## 🚀 What is Nooxy?

Nooxy is a modern, open-source Notion reverse proxy that allows you to host your Notion pages on your own custom domain with complete control over customization. Built with TypeScript and designed for Cloudflare Workers and modern Node.js runtimes (22+), Nooxy provides a powerful alternative to Notion's expensive custom domain feature with no much control for customization.

### Why Nooxy?

Notion's custom domain feature is expensive and offers limited customization control. Nooxy solves this by providing:

- **💰 Completely Free** - No monthly fees or usage limits
- **🎨 Full Customization** - Inject custom CSS, JavaScript, and HTML
- **🔧 Local Development** - Test your site locally before deployment
- **⚡ High Performance** - Specially Built for Cloudflare Workers edge computing and modern Node.js runtimes (22+)
- **🛠️ Developer Friendly** - CLI tools, TypeScript support, and extensive configuration options
- **🔗 Seamless Navigation** - Proper URL rewriting and internal link handling

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
- `npx nooxy generate [--path=/absolute/or/relative/path]` - Generate required string files from a custom path (defaults to current working directory). The configuration folder name must be `nooxy`.

### 🎨 **Custom Header Support**

- Inject custom HTML, CSS, and JavaScript into the header
- Complete control over the top navigation bar
- Responsive design with mobile optimization

### ⚡ **Optimized Caching**

- Smart configuration caching for better performance
- Multiple instance support for different environments
- Efficient memory usage

### 🔧 **Advanced Customization**

- Custom CSS injection for styling
- JavaScript injection for functionality
- HTML header customization
- Google Fonts integration
- Google Analytics support

### 🛡️ **Enhanced Security**

- Proper XMLHttpRequest handling
- Blocked problematic Notion requests
- Content Security Policy management

## 📦 Installation

### Prerequisites

- Node.js 22.0.0 or higher
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
    ├── head-js-string.js
    ├── body-js-string.js
    ├── head-css-string.js
    └── header-html-string.js
```

### 2. Configure Your Site

Edit `nooxy/config.js`:

```javascript
import { HEAD_JS_STRING } from './generated/head-js-string.js';
import { BODY_JS_STRING } from './generated/body-js-string.js';
import { HEAD_CSS_STRING } from './generated/head-css-string.js';
import { HEADER_HTML_STRING } from './generated/header-html-string.js';

/** @type {import('nooxy').NooxySiteConfig} */
export const SITE_CONFIG = {
  domain: 'your-domain.com',

  // Basic site information
  siteName: 'Your Site Name',
  siteDescription: 'Your site description for SEO',
  siteImage: 'https://your-domain.com/og-image.jpg',
  siteIcon: 'https://your-domain.com/favicon.ico',

  // Notion configuration
  notionDomain: 'your-workspace.notion.site', // Optional: your Notion workspace domain

  // Page mapping
  slugToPage: {
    '': 'NOTION_HOME_PAGE_ID', // Homepage
    about: 'NOTION_ABOUT_PAGE_ID', // /about
    contact: 'NOTION_CONTACT_PAGE_ID', // /contact
    'blog/post-1': 'NOTION_BLOG_POST_ID', // Nested pages
  },

  // Page-specific metadata
  pageMetadata: {
    NOTION_ABOUT_PAGE_ID: {
      title: 'About Us - Custom Title',
      description: 'Learn more about our company',
      image: 'https://your-domain.com/about-og.jpg',
      author: 'Your Name',
    },
  },

  // Subdomain redirects
  subDomains: {
    www: {
      redirect: 'https://your-domain.com',
    },
  },

  // 404 page
  fof: {
    page: 'NOTION_404_PAGE_ID',
    slug: '404',
  },

  // Customization
  googleFont: 'Roboto',
  googleTagID: 'GA_MEASUREMENT_ID',

  // Custom content
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
```

This reads files from `<path-or-cwd>/nooxy/{head.js,body.js,head.css,header.html}` and converts them into string constants under `<path-or-cwd>/nooxy/generated/`.

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

Or use in a modern Node.js 22+ runtime (e.g., express-like frameworks that support `Request`/`Response` or via polyfills):

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

| Field             | Type                     | Required | Description                              |
| ----------------- | ------------------------ | -------- | ---------------------------------------- |
| `domain`          | `string`                 | ✅       | Your custom domain (e.g., `example.com`) |
| `siteName`        | `string`                 | ✅       | Site name for SEO and social sharing     |
| `siteDescription` | `string`                 | ✅       | Site description for SEO                 |
| `slugToPage`      | `Record<string, string>` | ✅       | Mapping of URL slugs to Notion page IDs  |

### SEO & Metadata

| Field           | Type                           | Required | Description                                    |
| --------------- | ------------------------------ | -------- | ---------------------------------------------- |
| `siteImage`     | `string`                       | ❌       | Default Open Graph image URL                   |
| `siteIcon`      | `string`                       | ❌       | Custom favicon URL                             |
| `twitterHandle` | `string`                       | ❌       | X (formerly Twitter) handle for social sharing |
| `pageMetadata`  | `Record<string, PageMetadata>` | ❌       | Page-specific metadata overrides               |

### Navigation & URLs

| Field          | Type                                | Required | Description                      |
| -------------- | ----------------------------------- | -------- | -------------------------------- |
| `notionDomain` | `string`                            | ❌       | Your Notion workspace domain     |
| `subDomains`   | `Record<string, SubDomainRedirect>` | ❌       | Subdomain redirect configuration |
| `fof`          | `FofConfig`                         | ❌       | 404 page configuration           |

### Customization

| Field           | Type     | Required | Description                     |
| --------------- | -------- | -------- | ------------------------------- |
| `googleFont`    | `string` | ❌       | Google Font family name         |
| `googleTagID`   | `string` | ❌       | Google Analytics measurement ID |
| `customHeadCSS` | `string` | ❌       | Custom CSS for `<head>`         |
| `customHeadJS`  | `string` | ❌       | Custom JavaScript for `<head>`  |
| `customBodyJS`  | `string` | ❌       | Custom JavaScript for `<body>`  |
| `customHeader`  | `string` | ❌       | Custom HTML header content      |

### Page Metadata Interface

```typescript
interface PageMetadata {
  title?: string; // Page title override
  description?: string; // Page description override
  image?: string; // Page-specific Open Graph image
  author?: string; // Page author
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
npx nooxy generate [--path=/custom/path]
```

Converts your custom files (`head.js`, `body.js`, `head.css`, `header.html`) into importable string constants under `<path-or-cwd>/nooxy/generated/`.

**Options:**

- `--path`: Specify a custom directory path that contains a `nooxy/` folder

## 📁 Nooxy Config Structure

When you run `npx nooxy init`, the following structure is created on your repo:

```
your-project/
├── nooxy/                    # Nooxy configuration directory
│   ├── config.js            # Main configuration file
│   ├── head.js              # Custom JavaScript for <head>
│   ├── body.js              # Custom JavaScript for <body>
│   ├── head.css             # Custom CSS styles
│   ├── header.html          # Custom HTML header
│   └── generated/           # Auto-generated files
│       ├── head-js-string.js
│       ├── body-js-string.js
│       ├── head-css-string.js
│       └── header-html-string.js
├── src/
│   └── index.ts             # Your Cloudflare Worker
├── package.json
└── wrangler.toml            # Cloudflare Workers config
```

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
│   ├── meta-rewriter.ts  # Meta tag rewriting
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
5. **Response Delivery**: Serves the modified content to your visitors

### Notable Differences

Nooxy is inspired by [Fruition](https://github.com/stephenou/fruitionsite) and [NoteHost](https://github.com/velsa/notehost) but, Nooxy adds:

- A maintained TypeScript package API for embedding into different runtimes
- CLI with `init` (scaffold config) and `generate` (convert custom files to strings), with `--path` support on generate
- Multi-instance configuration with caching keyed by `configKey` for multi-tenant or multi-env setups
- Robust HTML rewriting for head, meta, and body plus helpers for Google Fonts and Analytics
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

#### 3. JavaScript Not Working

**Problem**: Custom JavaScript isn't executing.

**Solution**:

- Ensure your JavaScript is in the correct file (`head.js` or `body.js`)
- Run `npx nooxy generate` after making changes
- Check browser console for errors

#### 4. Local Development Issues

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

- **Portfolio Sites**: Perfect for developer portfolios and personal websites
- **Documentation**: Great for technical documentation and wikis
- **Blogs**: Excellent for personal and professional blogs
- **Landing Pages**: Ideal for product landing pages and marketing sites

## 📊 Performance

Nooxy is built for performance:

- **Edge Computing**: Runs on Cloudflare's global edge network
- **Optimized Caching**: Smart configuration caching reduces overhead
- **Minimal Bundle Size**: Lightweight and fast
- **TypeScript**: Type safety and better performance

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
