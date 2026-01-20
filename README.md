# Nooxy

<div align="center">

<img src="assets/logo.png" alt="Nooxy Logo" width="140" />

### **Turn Notion into a website. Free. Forever.**

**The only Notion reverse proxy with full SEO, zero dependencies, and complete customization.**

[![npm version](https://img.shields.io/npm/v/nooxy?style=flat-square)](https://www.npmjs.com/package/nooxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

[Quick Start](#-quick-start) · [Why Nooxy](#-why-nooxy) · [Features](#-features) · [Configuration](#-configuration-reference) · [Examples](./examples)

</div>

---

## The Problem

You built something great in Notion. Now you want to share it with the world on your own domain.

**Your options today:**

| Solution | Cost | SEO | Customization | Interactivity |
|----------|------|-----|---------------|---------------|
| **Notion Sites** | $10-22/mo | Limited, noindex issues | Minimal | Full |
| **Super.so** | $12-28/mo | Good, but subdomain-only hurts rankings | Good | Lost (static) |
| **Fruition** | Free | Poor, outdated | Limited | Full |
| **Nooxy** | **Free** | **Full SEO suite** | **Complete** | **Full** |

Notion Sites charges [$10/month per domain](https://www.notion.com/help/notion-sites-availability-and-pricing) with [limited SEO and customization](https://super.so/blog/notion-sites-pricing). Super.so costs [$12-28/month](https://super.so/pricing) and converts your pages to static HTML—you lose Notion's live databases, filtering, and real-time updates. Fruition is [no longer maintained](https://github.com/stephenou/fruitionsite) and lacks modern SEO features.

**Nooxy gives you everything. For free.**

### See It Live

These sites run on Nooxy right now:

- **[os.draphy.org](https://os.draphy.org)** — Life documented as a file system
- **[draphy.org](https://draphy.org)** — Personal site

View source, check the SEO tags, test the interactivity. It works.

---

## Why Nooxy?

<table>
<tr>
<td width="50%">

### What you get

- **$0/month** — No subscriptions, no limits
- **Full SEO** — Canonical URLs, structured data, proper indexing
- **Complete control** — Inject any CSS, JavaScript, HTML
- **Live Notion** — Real-time databases, filtering, collaboration
- **Your domain** — Professional URLs like `yourdomain.com/about`

</td>
<td width="50%">

### What you avoid

- ~~$120-336/year~~ on hosting fees
- ~~Subdomain SEO penalties~~ from free tiers
- ~~Static pages~~ that lose Notion's power
- ~~Vendor lock-in~~ from closed platforms
- ~~Outdated tools~~ that break with Notion updates

</td>
</tr>
</table>

---

## Features

### SEO That Actually Works

Nooxy rewrites Notion's HTML to give search engines exactly what they need:

- **Removes `noindex` tags** — Your pages get indexed by Google
- **Canonical URLs** — `https://yourdomain.com/about` not `/About-abc123def`
- **Structured data** — JSON-LD schema for rich search results
- **Open Graph & Twitter Cards** — Beautiful social media previews
- **Custom meta tags** — Title, description, keywords, author per page
- **AI attribution** — Proper source credits for ChatGPT, Claude, Perplexity
- **XML sitemap** — Auto-generated at `/sitemap.xml`
- **Robots.txt** — Proper crawler directives at `/robots.txt`

### Complete Customization

- **Custom CSS** — Override any Notion style, add your brand
- **JavaScript injection** — Analytics, interactions, custom functionality
- **HTML headers** — Navigation bars, announcements, CTAs
- **Google Fonts** — Apply any font family site-wide
- **Google Analytics** — Built-in GA4 support

### Production Ready

- **Zero dependencies** — Nothing to break, nothing to update
- **Edge computing** — Runs on Cloudflare Workers' global network
- **Node.js support** — Works with any modern Node.js runtime (18.17+)
- **Multi-tenant** — Host multiple sites from one deployment
- **Local development** — Test locally before deploying

### Developer Experience

- **TypeScript** — Full type safety and IntelliSense
- **CLI tools** — `npx nooxy init` and `npx nooxy generate`
- **Auto-minification** — CSS, JS, HTML optimized automatically
- **Clean URLs** — `/about` instead of `/About-Page-abc123def456`

---

## Quick Start

### 1. Install

```bash
npm install nooxy
```

### 2. Initialize

```bash
npx nooxy init
```

This creates a `nooxy/` folder with all configuration files.

### 3. Configure

Edit `nooxy/config.js`:

```javascript
export const SITE_CONFIG = {
  // Your custom domain
  domain: 'yourdomain.com',

  // Your Notion workspace (e.g., yourname.notion.site)
  notionDomain: 'yourname.notion.site',

  // Site name for SEO
  siteName: 'Your Site Name',

  // Map URLs to Notion page IDs
  slugToPage: {
    '/': 'YOUR_HOME_PAGE_ID',           // yourdomain.com/
    '/about': 'YOUR_ABOUT_PAGE_ID',     // yourdomain.com/about
    '/blog': 'YOUR_BLOG_PAGE_ID',       // yourdomain.com/blog
  },

  // SEO configuration (optional but recommended)
  seo: {
    indexing: true,                      // Enable search engine indexing
    keywords: 'your, keywords, here',
    defaultAuthor: 'Your Name',
  },

  // Required: Generated files (don't modify)
  customHeadCSS: HEAD_CSS_STRING,
  customHeadJS: HEAD_JS_STRING,
  customBodyJS: BODY_JS_STRING,
  customHeader: HEADER_HTML_STRING,
};
```

### 4. Generate

```bash
npx nooxy generate
```

### 5. Deploy

**Cloudflare Workers** (recommended):

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';

const proxy = initializeNooxy(SITE_CONFIG);

export default {
  async fetch(request: Request): Promise<Response> {
    return proxy(request);
  },
};
```

**Node.js**:

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';
import http from 'node:http';

const proxy = initializeNooxy(SITE_CONFIG);

http.createServer(async (req, res) => {
  const request = new Request(`http://${req.headers.host}${req.url}`);
  const response = await proxy(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(8787);
```

---

## Configuration Reference

### Required

| Field | Description |
|-------|-------------|
| `domain` | Your custom domain (e.g., `example.com`) |
| `notionDomain` | Your Notion workspace domain (e.g., `yourname.notion.site`) |
| `siteName` | Site name for SEO and social sharing |
| `slugToPage` | URL path to Notion page ID mapping |
| `customHeadCSS` | Generated CSS string |
| `customHeadJS` | Generated head JavaScript string |
| `customBodyJS` | Generated body JavaScript string |
| `customHeader` | Generated header HTML string |

### SEO Configuration

```javascript
seo: {
  // Enable search engine indexing (default: true)
  indexing: true,

  // Canonical domain (if different from domain)
  // Useful when nooxy runs on subdomain but SEO points to main domain
  canonicalDomain: 'example.com',

  // Path mapping for canonical URLs
  // Maps nooxy paths to canonical domain paths
  canonicalPathMap: {
    '/': '/home',           // os.example.com/ → example.com/home
    '/docs': '/documentation',
  },

  // Meta keywords for SEO
  keywords: 'notion, website, custom domain',

  // Default author for pages
  defaultAuthor: 'Your Name',

  // Replace "Notion" branding with custom text
  brandReplacement: 'Your Brand',

  // AI crawler attribution (ChatGPT, Claude, etc.)
  aiAttribution: 'Your Name - yourdomain.com',
}
```

### Page-Specific Metadata

```javascript
pageMetadata: {
  'NOTION_PAGE_ID': {
    title: 'Custom Page Title',
    description: 'Custom meta description for this page',
    image: 'https://yourdomain.com/og-image.jpg',
    author: 'Page Author Name',
  },
}
```

### Optional Features

| Field | Description |
|-------|-------------|
| `twitterHandle` | Twitter/X handle for social cards (e.g., `@yourusername`) |
| `siteIcon` | Custom favicon URL |
| `googleFont` | Google Font family name (e.g., `Inter`) |
| `googleTagID` | Google Analytics measurement ID |
| `fof` | Custom 404 page configuration |
| `subDomains` | Subdomain redirect rules |

---

## CLI Commands

### Initialize Project

```bash
npx nooxy init
```

Creates the `nooxy/` directory with all configuration templates.

### Generate Files

```bash
# Standard generation (with minification)
npx nooxy generate

# Custom path
npx nooxy generate --path=./my-project

# Without minification (for debugging)
npx nooxy generate --no-minify
```

Converts your custom files to optimized, importable strings.

---

## Customization

### Custom CSS (`nooxy/head.css`)

```css
/* Hide Notion's default elements */
.notion-topbar { display: none !important; }

/* Custom styling */
.notion-page-content {
  max-width: 900px;
  margin: 0 auto;
  font-family: 'Inter', sans-serif;
}

/* Dark mode support */
.dark .notion-page-content {
  background: #1a1a1a;
}
```

### Custom JavaScript (`nooxy/body.js`)

```javascript
// Analytics, interactions, custom functionality
document.addEventListener('DOMContentLoaded', () => {
  console.log('Site loaded with Nooxy!');

  // Track page views, add smooth scrolling, etc.
});
```

### Custom Header (`nooxy/header.html`)

```html
<nav class="site-nav">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
</nav>
```

---

## How It Works

```
User Request → Nooxy → Notion
     ↓
  Rewrite URLs, inject SEO, add customizations
     ↓
User Response ← Modified HTML
```

1. **Intercepts** requests to your custom domain
2. **Maps** clean URLs (`/about`) to Notion page IDs
3. **Fetches** content from Notion's servers
4. **Rewrites** meta tags, URLs, and structured data for SEO
5. **Injects** your custom CSS, JavaScript, and headers
6. **Serves** the optimized response to visitors

---

## Compared to Alternatives

### vs Notion Sites

| | Notion Sites | Nooxy |
|---|---|---|
| **Price** | $10-22/mo | Free |
| **Custom domain** | Paid add-on | Included |
| **SEO control** | Limited | Full |
| **CSS/JS injection** | No | Yes |
| **noindex removal** | Manual | Automatic |

### vs Super.so

| | Super.so | Nooxy |
|---|---|---|
| **Price** | $12-28/mo | Free |
| **Notion interactivity** | Lost (static) | Preserved |
| **Database filtering** | No | Yes |
| **Real-time updates** | No | Yes |
| **Hosting type** | Subdomain | Your domain |

### vs Fruition

| | Fruition | Nooxy |
|---|---|---|
| **Maintained** | No (2020) | Yes (2024+) |
| **SEO features** | Basic | Comprehensive |
| **TypeScript** | No | Yes |
| **CLI tools** | No | Yes |
| **Multi-tenant** | No | Yes |

---

## Architecture

```
src/
├── index.ts              # Main export
├── proxy.ts              # Core reverse proxy
├── types.ts              # TypeScript definitions
├── helpers/              # Utilities
├── handlers/             # Request handlers (sitemap, robots, etc.)
├── rewriters/            # HTML rewriting (meta, data, headers)
└── cli/                  # CLI commands (init, generate)
```

---

## Troubleshooting

### Pages return 404

- Verify Notion page IDs are correct (32-character hex)
- Ensure pages are published publicly in Notion
- Check `notionDomain` matches your Notion workspace

### CSS not applied

- Run `npx nooxy generate` after changes
- Use `!important` to override Notion styles
- Check browser console for errors

### SEO tags not appearing

- Ensure `seo.indexing` is `true` (default)
- Check that you're viewing the source (not rendered DOM)
- Verify your deployment is using the latest build

---

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/draphy/nooxy/issues)
- **Discussions**: [Ask questions](https://github.com/draphy/nooxy/discussions)
- **Email**: contact@draphy.org

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

Inspired by [Fruition](https://github.com/stephenou/fruitionsite) and [NoteHost](https://github.com/velsa/notehost), rebuilt for the modern web with comprehensive SEO, TypeScript, and zero dependencies.

---

<div align="center">

**Made with ❤️ by [David Raphi](https://github.com/draphy)**

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/draphy)
[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/draphyofficial)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/draphy)

---

### Stop paying for Notion hosting. Start with Nooxy.

```bash
npm install nooxy && npx nooxy init
```

**[Star this repo](https://github.com/draphy/nooxy)** if it saved you $120+/year.

</div>
