# Nooxy

<p align="center">
  <img src="assets/logo.png" alt="Nooxy Logo" width="140" />
</p>

<h3 align="center"><b>Turn Notion into a website. Free. Forever.</b></h3>

<p align="center">
  <b>The only Notion reverse proxy with full SEO, zero dependencies, and complete customization.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nooxy"><img src="https://img.shields.io/npm/v/nooxy?style=flat-square" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#why-nooxy">Why Nooxy</a> · <a href="#features">Features</a> · <a href="#configuration-reference">Configuration</a> · <a href="#project-files">Customization</a> · <a href="#full-deployment-guides">Deployment Guides</a>
</p>

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
- **[em-ucd.com](https://em-ucd.com)** — Portfolio

View source, check the SEO tags, test the interactivity. It works.

**Using Nooxy?** [Share your site in Discussions](https://github.com/draphy/nooxy/discussions) — we'd love to see it!

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

> **New to this?** If you don't have a project set up yet, start with our [Full Deployment Guides](#full-deployment-guides) instead — they walk you through everything from creating an account to deploying your live site. Currently available for **[Cloudflare Workers](./examples/cloudflare/README.md)** (recommended, ~15 min).

This section shows how to add Nooxy to an **existing** JavaScript/TypeScript project. It works with Cloudflare Workers, Node.js, Deno, Bun, or any runtime that supports the Fetch API.

For all configuration options and customization, see:
- [Configuration Reference](#configuration-reference) — all config options
- [Project Files](#project-files) — CSS, JavaScript, and HTML injection
- [CLI Commands](#cli-commands) — available commands

### 1. Install

In your project folder (where `package.json` is), run:

```bash
npm install nooxy
```

### 2. Initialize

```bash
npx nooxy init
```

This creates a `nooxy/` folder with all configuration files:

```
nooxy/
├── config.js       # Main configuration
├── head.css        # Custom CSS (optional)
├── head.js         # JavaScript for <head> (optional)
├── body.js         # JavaScript for <body> (optional)
└── header.html     # Custom header HTML (optional)
```

### 3. Get Your Notion Page IDs

Every Notion page has a unique **Page ID** — a 32-character code that identifies it.

**How to find it:**

1. Open your Notion page in a browser
2. Look at the URL:
   ```
   https://www.notion.so/My-Page-Title-abc123def456789012345678901234ab
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is your Page ID (32 characters)
   ```
3. Copy just the ID part (after the last hyphen)

**Examples:**

| URL | Page ID |
|-----|---------|
| `notion.so/Home-abc123def456789012345678901234ab` | `abc123def456789012345678901234ab` |
| `myworkspace.notion.site/Blog-11122233344455566677788899900aaa` | `11122233344455566677788899900aaa` |

**Important:** Make sure your Notion pages are **published to web** (Share → Publish → Publish to web).

### 4. Configure

Edit `nooxy/config.js`:

```javascript
export const SITE_CONFIG = {
  // Your custom domain (without https://)
  domain: 'yourdomain.com',

  // Your Notion workspace domain
  // Find it in your Notion URL: https://YOUR-WORKSPACE.notion.site/...
  notionDomain: 'yourworkspace.notion.site',

  // Site name (appears in browser tabs and search results)
  siteName: 'Your Site Name',

  // Map URL paths to Notion page IDs
  // Left side: URL on your site
  // Right side: Notion page ID (32 characters)
  slugToPage: {
    '/': 'YOUR_HOME_PAGE_ID',           // yourdomain.com/
    '/about': 'YOUR_ABOUT_PAGE_ID',     // yourdomain.com/about
    '/blog': 'YOUR_BLOG_PAGE_ID',       // yourdomain.com/blog
  },

  // SEO settings (optional but recommended)
  seo: {
    indexing: true,                     // Allow search engines to index
    keywords: 'your, keywords, here',
    defaultAuthor: 'Your Name',
  },

  // These are auto-generated — don't modify
  customHeadCSS: HEAD_CSS_STRING,
  customHeadJS: HEAD_JS_STRING,
  customBodyJS: BODY_JS_STRING,
  customHeader: HEADER_HTML_STRING,
};
```

### 5. Generate

After editing your config, process the files:

```bash
npx nooxy generate
```

**Run this command every time you change anything in the `nooxy/` folder.**

### 6. Integrate with Your Runtime

Nooxy exports a single function that handles all requests. Add this to your server/worker entry point:

> **Need step-by-step deployment instructions?** See the [Full Deployment Guides](#full-deployment-guides) for complete setup including file creation, testing, and deployment.

**Cloudflare Workers:**

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from '../nooxy/config';

const proxy = initializeNooxy(SITE_CONFIG);

export default {
  async fetch(request: Request): Promise<Response> {
    return proxy(request);
  },
};
```

**Node.js (18.17+):**

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';
import http from 'node:http';

const proxy = initializeNooxy(SITE_CONFIG);

http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
  });
  
  const response = await proxy(request);
  
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(8787, () => {
  console.log('Server running at http://localhost:8787');
});
```

**Any Fetch-compatible runtime:**

```typescript
import { initializeNooxy } from 'nooxy';
import { SITE_CONFIG } from './nooxy/config';

const proxy = initializeNooxy(SITE_CONFIG);

// proxy(request: Request) => Promise<Response>
// Pass any standard Request, get a standard Response
```

---

## Full Deployment Guides

The Quick Start above covers Nooxy setup. If you need a complete walkthrough — from creating an account to deploying your live site — use these platform-specific guides:

| Platform | Guide | Description |
|----------|-------|-------------|
| **Cloudflare Workers** | [Full Guide →](./examples/cloudflare/README.md) | Recommended. Free tier, global edge network, ~15 min setup |
| **Node.js** | Coming soon | For self-hosted servers |

These guides include all the Nooxy setup steps plus platform-specific deployment instructions.

---

## Configuration Reference

All configuration is in `nooxy/config.js`. After any changes, run `npx nooxy generate` to apply them.

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `domain` | Your custom domain (without https://) | `example.com` |
| `notionDomain` | Your Notion workspace domain (prevents serving unintended Notion content) | `myname.notion.site` |
| `siteName` | Site name for browser tabs, SEO, and `og:site_name` | `My Portfolio` |
| `slugToPage` | URL path → Notion page ID mapping (32-char hex IDs) | `{ '/': 'abc123...' }` |

### Generated Fields

These fields are auto-populated by `npx nooxy generate` from files in the `nooxy/` folder. Don't edit them directly — edit the source files instead:

| Field | Source File | Purpose |
|-------|-------------|---------|
| `customHeadCSS` | `nooxy/head.css` | CSS injected into `<head>` |
| `customHeadJS` | `nooxy/head.js` | JavaScript injected into `<head>` (runs before page loads) |
| `customBodyJS` | `nooxy/body.js` | JavaScript injected before `</body>` (runs after page loads) |
| `customHeader` | `nooxy/header.html` | HTML injected into page header (navigation, banners, etc.) |

### SEO Configuration

```javascript
seo: {
  // Enable search engine indexing (default: true)
  // When true: removes Notion's noindex tags, adds canonical URLs, 
  // injects robots meta, generates sitemap.xml and robots.txt
  indexing: true,

  // Canonical domain (if different from domain)
  // Use when Nooxy runs on a subdomain but SEO should point to main domain
  // Affects: canonical URLs, og:url, twitter:url, sitemap.xml
  canonicalDomain: 'example.com',

  // Path mapping for canonical URLs
  // Maps paths from your Nooxy domain to the canonical domain
  canonicalPathMap: {
    '/': '/home',              // subdomain.example.com/ → example.com/home
    '/docs': '/documentation',
  },

  // Meta keywords (adds <meta name="keywords">)
  keywords: 'notion, website, portfolio',

  // Default author for all pages (adds <meta name="author"> and article:author)
  // Can be overridden per-page in pageMetadata
  defaultAuthor: 'Your Name',

  // Replace "Notion" branding with your brand in all meta tags
  // Affects: <title>, og:title, og:description, og:site_name, twitter:title, etc.
  // Default: uses siteName
  brandReplacement: 'Your Brand',

  // AI crawler attribution (ChatGPT, Claude, Perplexity)
  // Adds: <meta name="ai:source_url"> and <meta name="ai:source_attribution">
  // Helps AI systems properly credit your content
  aiAttribution: 'Your Name - yourdomain.com',
}
```

### Page-Specific Metadata

Override meta tags for specific pages. Key is the Notion page ID (32 characters):

```javascript
pageMetadata: {
  'abc123def456789012345678901234ab': {
    title: 'Custom Page Title',           // <title>, og:title, twitter:title
    description: 'Custom meta description', // meta description, og:description, twitter:description
    image: 'https://yourdomain.com/og.jpg', // og:image, twitter:image
    author: 'Page Author Name',            // article:author (overrides seo.defaultAuthor)
  },
}
```

### Social & Branding

| Field | Description | Example |
|-------|-------------|---------|
| `twitterHandle` | Twitter/X handle for `twitter:site` meta tag (include @) | `@yourusername` |
| `siteIcon` | Custom favicon URL (.ico format). If not set, uses Notion's default | `https://example.com/favicon.ico` |

### Typography & Analytics

| Field | Description | Example |
|-------|-------------|---------|
| `googleFont` | Google Font family name from [fonts.google.com](https://fonts.google.com). Applied site-wide | `Inter`, `Roboto` |
| `googleTagID` | Google Analytics 4 measurement ID. Injects GA4 tracking script | `G-XXXXXXXXXX` |

### 404 Page

Custom Notion page to display for 404 errors:

```javascript
fof: {
  page: 'NOTION_404_PAGE_ID',  // Your custom 404 page (32-char ID)
  slug: '/404',                // URL path (default: '/404')
}
```

### Subdomain Redirects

Redirect subdomains to your main domain. Common use: redirect www to non-www:

```javascript
subDomains: {
  www: {
    redirect: 'https://example.com',  // www.example.com → example.com (301 redirect)
  },
}
```

### Nooxy Configuration

```javascript
nooxy: {
  // Show "Made with Nooxy" badge in header (default: true)
  // Set to false to hide it... 💔 it'll break my heart, but hey,
  // if it helps your site look cleaner, I'll survive... probably 😢
  showBadge: true,
}
```

> 💜 If Nooxy helped you, a [GitHub sponsorship](https://github.com/sponsors/draphy) would mean the world!

### Auto-Generated Features

These features work automatically — no configuration needed:

| Feature | URL | Description |
|---------|-----|-------------|
| **Sitemap** | `/sitemap.xml` | Auto-generated XML sitemap with all pages from `slugToPage` |
| **Robots.txt** | `/robots.txt` | Points crawlers to your sitemap |
| **Clean URLs** | — | Rewrites Notion URLs (`/Page-abc123`) to your slugs (`/about`) |
| **JSON-LD Schema** | — | Injects structured data for rich search results |
| **Canonical URLs** | — | Adds `<link rel="canonical">` to every page |
| **Open Graph** | — | Rewrites `og:url`, `og:site_name` for proper social sharing |
| **Twitter Cards** | — | Rewrites `twitter:url`, `twitter:site` for Twitter/X previews |

---

## CLI Commands

```bash
# Create nooxy/ folder with config files
npx nooxy init

# Process config changes (run after editing any nooxy/ file)
npx nooxy generate

# Generate with custom path
npx nooxy generate --path=./my-project

# Generate without minification (for debugging)
npx nooxy generate --no-minify
```

---

## Project Files

When you run `npx nooxy init`, it creates a `nooxy/` folder with these files:

```
nooxy/
├── config.js       # Main configuration (domain, pages, SEO settings)
├── head.css        # Custom CSS injected into <head>
├── head.js         # JavaScript injected into <head> (runs before page loads)
├── body.js         # JavaScript injected before </body> (runs after page loads)
└── header.html     # Custom HTML injected into page header
```

### How Files Are Processed

1. You edit the source files (`head.css`, `body.js`, etc.)
2. Run `npx nooxy generate` — this reads the files, minifies them, and writes them to `nooxy/generated/` (which `config.js` imports)
3. When your site runs, Nooxy injects these into every page response

```
                     npx nooxy generate
+---------------+                          +---------------+
|   head.css    |  ----------------------> |               |
|   head.js     |    (minifies & embeds)   |   config.js   |
|   body.js     |  ----------------------> |               |
|  header.html  |                          |               |
+---------------+                          +---------------+
```

> **Important:** Run `npx nooxy generate` every time you change anything in the `nooxy/` folder. Your changes won't take effect until you regenerate and redeploy.

### File Reference

#### `config.js` — Main Configuration

Contains all your site settings. See [Configuration Reference](#configuration-reference) for all options.

```javascript
export const SITE_CONFIG = {
  domain: 'yourdomain.com',
  notionDomain: 'yourworkspace.notion.site',
  siteName: 'Your Site Name',
  slugToPage: {
    '/': 'YOUR_PAGE_ID',
  },
  // ... other options
};
```

#### `head.css` — Custom Styles

CSS injected into `<head>`. Use this to override Notion's default styles:

```css
/* Hide Notion's top bar */
.notion-topbar { display: none !important; }

/* Custom page styling */
.notion-page-content {
  max-width: 900px;
  margin: 0 auto;
}

/* Dark mode support */
.dark .notion-page-content {
  background: #1a1a1a;
}
```

**Tips:**
- Use `!important` to override Notion's styles
- Notion uses `.dark` class for dark mode
- Inspect your Notion page to find class names to target

#### `head.js` — Early JavaScript

JavaScript injected into `<head>`. Runs **before** the page content loads. Use for:
- Analytics that need to run early
- Setting up global variables
- Theme detection before render

```javascript
// Example: Set theme before page renders to prevent flash
const theme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);
```

#### `body.js` — Main JavaScript

JavaScript injected before `</body>`. Runs **after** the page content loads. Use for:
- DOM manipulation
- Event listeners
- Interactive features

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Add smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector(anchor.getAttribute('href')).scrollIntoView({
        behavior: 'smooth'
      });
    });
  });
});
```

#### `header.html` — Custom Header

HTML injected at the top of the page body. Use for navigation bars, announcements, or banners:

```html
<nav style="padding: 1rem; background: #f5f5f5; display: flex; gap: 1rem;">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact</a>
</nav>
```

### After Making Changes

Every time you edit any file in `nooxy/`:

```bash
# 1. Regenerate the config
npx nooxy generate

# 2. Redeploy (platform-specific)
npm run deploy          # Cloudflare Workers
# or restart your server  # Node.js
```

Content changes in Notion appear automatically — no regeneration needed. Only changes to `nooxy/` files require regeneration.

---

## How It Works

```
User Request --> Nooxy --> Notion
                  |          |
                  |    <-----+  (fetches HTML)
                  |
                  v
            [Rewrite & Inject]
                  |
                  v
User Response <-- Modified HTML
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

### vs Fruition

| | Fruition | Nooxy |
|---|---|---|
| **Maintained** | No (2020) | Yes (2024+) |
| **SEO features** | Basic | Comprehensive |
| **TypeScript** | No | Yes |
| **CLI tools** | No | Yes |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Pages return 404** | Verify page IDs are 32 characters, pages are published in Notion, `notionDomain` matches your workspace |
| **CSS not applied** | Run `npx nooxy generate` after changes, use `!important` to override Notion styles |
| **SEO tags not appearing** | Ensure `seo.indexing` is `true`, view page source (not rendered DOM), redeploy |
| **"Cannot find module 'nooxy'"** | Run `npm install nooxy` |

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
