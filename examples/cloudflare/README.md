# Deploy Nooxy on Cloudflare Workers

A complete guide to deploy your Notion site on Cloudflare Workers.

## Prerequisites

- [Node.js](https://nodejs.org) v18.17+ installed
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- Your Notion pages set to public

## Step 1: Create Your Project

Open your terminal and run these commands one by one:

```bash
# Create a new Cloudflare Workers project
npm create cloudflare@latest my-nooxy-site

# When asked:
# - "What would you like to start with?" → Select "Hello World example"
# - "Which template?" → Select "Hello World Worker"
# - "Which language?" → Select "TypeScript"
# - "Do you want to use git?" → Your choice (Yes is fine)
# - "Do you want to deploy?" → Select "No" (we'll do this later)
```

Now move into your project folder:

```bash
cd my-nooxy-site
```

## Step 2: Install and Initialize Nooxy

```bash
npm install nooxy
npx nooxy init
```

This creates a `nooxy/` folder with configuration files at your project root.

## Step 3: Get Your Notion Page IDs

You need the ID of each Notion page you want to include on your site.

1. Open your Notion page in a browser
2. Look at the URL. It looks something like:
   ```
   https://www.notion.so/My-Page-Title-abc123def456789...
   ```
3. The page ID is the long string of letters and numbers at the end (32 characters)
4. Copy just the ID part: `abc123def456789...`

**Tip:** If your URL has a custom domain or workspace name, the ID is still the last part after the final hyphen.

## Step 4: Configure Your Site

Open `nooxy/config.js` and update these values:

```javascript
export const SITE_CONFIG = {
  // Your website domain (use workers.dev for now if you don't have one)
  domain: 'my-nooxy-site.your-subdomain.workers.dev',

  // Your Notion workspace domain
  // Find this by opening any Notion page and looking at the URL
  // It's usually: yourname.notion.site
  notionDomain: 'yourname.notion.site',

  // Your website name (appears in browser tabs and search results)
  siteName: 'My Website',

  // Map your URLs to Notion page IDs
  slugToPage: {
    '/': 'paste-your-home-page-id-here',
    '/about': 'paste-your-about-page-id-here',
    '/blog': 'paste-your-blog-page-id-here',
  },

  // ... rest of the config
};
```

**Important:** Make sure your Notion pages are set to "Public" in Notion's share settings.

## Step 5: Generate Assets

```bash
npx nooxy generate
```

> Run this from your project root (where `package.json` is). Or use `npx nooxy generate --path=/your/project/path` from anywhere.

## Step 6: Update the Worker Code

Open `src/index.ts` and replace everything with:

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

## Step 7: Test Locally

```bash
npm run dev
```

Open `http://localhost:8787` in your browser. Press `Ctrl + C` to stop.

## Step 8: Deploy

```bash
# Log in to Cloudflare (first time only)
npx wrangler login

# Deploy
npm run deploy
```

You'll get a live URL like `https://my-nooxy-site.your-subdomain.workers.dev`

---

## Custom Domain (Optional)

Skip this if you're fine with the `.workers.dev` URL.

### If Your Domain is Already on Cloudflare

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click your worker → **Settings** → **Domains & Routes**
3. Click **Add** → **Custom Domain**
4. Enter your domain and click **Add Domain**

Then update `domain` in `nooxy/config.js` and redeploy:

```bash
npx nooxy generate
npm run deploy
```

### If Your Domain is Not on Cloudflare Yet

You need to add your domain to Cloudflare first (you don't need to transfer it):

1. **Cloudflare Dashboard** → **Websites** → **Add a Site**
2. Enter your domain, select **Free** plan
3. Cloudflare gives you two nameservers
4. Go to your registrar (where you bought the domain) and update the nameservers
5. Wait for propagation (usually under 1 hour)

Then follow the steps above to connect it to your worker.

<details>
<summary>Where to find nameserver settings at popular registrars</summary>

- **GoDaddy:** My Products → Domain → DNS → Nameservers
- **Namecheap:** Domain List → Manage → Nameservers → Custom DNS
- **Google Domains:** DNS → Custom name servers
- **Porkbun:** Domain Management → Nameservers

</details>

### Don't Have a Domain?

Buy one from [Cloudflare Registrar](https://dash.cloudflare.com/?to=/:account/domains/register) or any registrar (Namecheap, Porkbun, etc.). Costs ~$10-15/year.

---

## Adding More Pages

To add new pages to your site:

1. Create the page in Notion
2. Make it public (Share → Publish to web)
3. Copy the page ID from the URL
4. Add it to `slugToPage` in `nooxy/config.js`:
   ```javascript
   slugToPage: {
     '/': 'home-page-id',
     '/about': 'about-page-id',
     '/blog': 'blog-page-id',
     '/contact': 'your-new-page-id',  // Add new pages here
   },
   ```
5. Run `npx nooxy generate`
6. Run `npm run deploy`

---

## Updating Your Site

Whenever you change your Nooxy configuration:

```bash
npx nooxy generate
npm run deploy
```

Changes to your Notion content appear automatically (no redeploy needed).

---

## Troubleshooting

### "Page not found" error

- Check that the Notion page is set to Public
- Verify the page ID is correct (32 characters, no hyphens)
- Make sure `notionDomain` matches your Notion workspace

### "Cannot find module 'nooxy'" error

Run `npm install nooxy` in your project folder.

### Site looks broken or unstyled

- Run `npx nooxy generate` after any config changes
- Clear your browser cache or try incognito mode

### Domain not working

- Wait up to 24 hours for DNS propagation
- Check that nameservers are correctly updated at your registrar
- Verify the domain shows "Active" in Cloudflare dashboard

### Need more help?

- [Open an issue on GitHub](https://github.com/draphy/nooxy/issues)
- [Join the discussions](https://github.com/draphy/nooxy/discussions)

---

## Quick Reference

| Command | What it does |
|---------|--------------|
| `npm install nooxy` | Install Nooxy in your project |
| `npx nooxy init` | Create configuration files |
| `npx nooxy generate` | Process your config changes |
| `npm run dev` | Test locally at localhost:8787 |
| `npx wrangler login` | Log in to Cloudflare |
| `npm run deploy` | Deploy to Cloudflare |

---

## Project Structure

This folder (`examples/cloudflare/`) is a working reference. Your project will have the same structure:

```
my-nooxy-site/
├── src/
│   └── index.ts        # Your worker code
├── nooxy/
│   ├── config.js       # Your site configuration
│   ├── head.css        # Custom CSS (optional)
│   ├── head.js         # Custom JavaScript for <head> (optional)
│   ├── body.js         # Custom JavaScript for <body> (optional)
│   └── header.html     # Custom header HTML (optional)
├── package.json
└── wrangler.jsonc      # Cloudflare configuration
```

