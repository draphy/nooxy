# Deploy Nooxy on Cloudflare Workers

A complete, step-by-step guide to deploy your Notion site on Cloudflare Workers. Takes about 15 minutes. No prior experience needed.

---

## What You'll Need

Before starting, make sure you have:

- [ ] **Node.js** (v18.17 or higher) — [Download here](https://nodejs.org) if you don't have it
- [ ] **A Cloudflare account** — [Sign up free](https://dash.cloudflare.com/sign-up) (no credit card required)
- [ ] **A Notion page** — Any page you want to turn into a website

Optional:
- [ ] **A custom domain** — You can use Cloudflare's free `.workers.dev` URL to start, then add a custom domain later

---

## Step 1: Create Your Project

Open your terminal (Command Prompt on Windows, Terminal on Mac/Linux) and run:

```bash
npm create cloudflare@latest my-nooxy-site
```

You'll be asked a few questions. Select these options:

| Question | Select |
|----------|--------|
| What would you like to start with? | **Hello World example** |
| Which template? | **Hello World Worker** |
| Which language? | **TypeScript** |
| Do you want to use git? | Your choice (Yes is fine) |
| Do you want to deploy? | **No** (we'll do this later) |

Now move into your project folder:

```bash
cd my-nooxy-site
```

---

## Step 2: Install Nooxy

Run these commands inside your `my-nooxy-site` folder:

```bash
npm install nooxy
npx nooxy init
```

This creates a `nooxy/` folder with all the configuration files you need.

Your project should now look like this:

```
my-nooxy-site/
├── src/
│   └── index.ts
├── nooxy/           ← Created by nooxy init
│   ├── config.js
│   ├── head.css
│   ├── head.js
│   ├── body.js
│   └── header.html
├── package.json
└── wrangler.jsonc
```

---

## Step 3: Get Your Notion Page ID

Every Notion page has a unique **Page ID** — a 32-character code that identifies it. You need this to connect your domain to your Notion pages.

### How to find your Page ID:

1. Open your Notion page in a browser
2. Look at the URL in your browser's address bar:

```
https://www.notion.so/My-Page-Title-abc123def456789012345678901234ab
                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                     This is your Page ID (32 characters)
```

3. Copy just the ID part (the 32 characters at the end, after the last hyphen)

**Examples:**

| URL | Page ID |
|-----|---------|
| `notion.so/Home-abc123def456789012345678901234ab` | `abc123def456789012345678901234ab` |
| `notion.so/About-Me-def456789abc123def456789012345ab` | `def456789abc123def456789012345ab` |
| `myworkspace.notion.site/Blog-11122233344455566677788899900aaa` | `11122233344455566677788899900aaa` |

**Important:** The page ID is always 32 characters, containing only letters (a-f) and numbers (0-9).

---

## Step 4: Make Your Notion Pages Public

Your Notion pages must be public for Nooxy to access them:

1. Open your Notion page
2. Click **Share** (top right)
3. Click **Publish** tab
4. Toggle **Publish to web** ON
5. Repeat for each page you want on your site

---

## Step 5: Configure Your Site

Open `nooxy/config.js` in any text editor and update these values:

```javascript
export const SITE_CONFIG = {
  // Your website address
  // Use the workers.dev URL for now, or your custom domain if you have one
  domain: 'my-nooxy-site.your-subdomain.workers.dev',

  // Your Notion workspace domain
  // Find this in any Notion page URL: https://YOUR-WORKSPACE.notion.site/...
  notionDomain: 'your-workspace.notion.site',

  // Your website name (shows in browser tabs and search results)
  siteName: 'My Website',

  // Connect your URLs to Notion pages
  // Left side: the URL path on your site
  // Right side: the Notion page ID (32 characters)
  slugToPage: {
    '/': 'paste-your-home-page-id-here',           // yourdomain.com/
    '/about': 'paste-your-about-page-id-here',     // yourdomain.com/about
    '/blog': 'paste-your-blog-page-id-here',       // yourdomain.com/blog
  },

  // ... keep the rest of the file as is
};
```

### Quick Reference: What to change

| Field | What to put | Example |
|-------|-------------|---------|
| `domain` | Your website URL | `my-site.workers.dev` or `example.com` |
| `notionDomain` | Your Notion workspace | `myname.notion.site` |
| `siteName` | Your website name | `John's Portfolio` |
| `slugToPage` | URL → Page ID mapping | `'/': 'abc123...'` |

These are the required fields to get started. Nooxy has many more options for SEO, custom fonts, analytics, 404 pages, and more — see [Configuration Reference](https://github.com/draphy/nooxy#configuration-reference) in the main README.

---

## Step 6: Generate Assets

After editing your config, run:

```bash
npx nooxy generate
```

This processes your configuration and prepares everything for deployment.

> **Important:** Run this command every time you change anything in the `nooxy/` folder. Your changes won't take effect until you regenerate.

For more CLI options (custom paths, debugging), see [CLI Commands](https://github.com/draphy/nooxy#cli-commands) in the main README.

---

## Step 7: Update the Worker Code

Open `src/index.ts` and replace **everything** in it with:

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

Save the file.

---

## Step 8: Test Locally

Before deploying, test your site on your computer:

```bash
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) in your browser. You should see your Notion page!

Press `Ctrl + C` (or `Cmd + C` on Mac) to stop the local server.

### Common issues at this step:

| Problem | Solution |
|---------|----------|
| "Page not found" | Check that your Notion page is published to web |
| "Cannot find module 'nooxy'" | Run `npm install nooxy` |
| Blank page | Verify your page ID is correct (32 characters) |

---

## Step 9: Deploy to Cloudflare

First, log in to Cloudflare (you only need to do this once):

```bash
npx wrangler login
```

This opens your browser. Click "Allow" to authorize.

Now deploy your site:

```bash
npm run deploy
```

**Done!** You'll see a URL like:

```
https://my-nooxy-site.your-subdomain.workers.dev
```

Visit this URL — your Notion site is now live on the internet!

---

## Optional: Add a Custom Domain

Skip this section if you're happy with the `.workers.dev` URL.

### If you already have a domain on Cloudflare:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Click your worker (`my-nooxy-site`)
3. Go to **Settings** → **Domains & Routes**
4. Click **Add** → **Custom Domain**
5. Enter your domain (e.g., `example.com`) and click **Add Domain**
6. Update `domain` in `nooxy/config.js` to match your custom domain
7. Run:
   ```bash
   npx nooxy generate
   npm run deploy
   ```

### If your domain is NOT on Cloudflare yet:

You need to add your domain to Cloudflare first (you don't need to transfer it, just point the nameservers):

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Websites** → **Add a Site**
2. Enter your domain name
3. Select the **Free** plan
4. Cloudflare will show you two nameservers (e.g., `ada.ns.cloudflare.com`)
5. Go to where you bought your domain (GoDaddy, Namecheap, etc.) and update the nameservers to the ones Cloudflare gave you
6. Wait for DNS propagation (usually under 1 hour, can take up to 24 hours)
7. Once your domain shows "Active" in Cloudflare, follow the steps above

<details>
<summary><b>Where to find nameserver settings at popular registrars</b></summary>

| Registrar | Where to find it |
|-----------|------------------|
| **GoDaddy** | My Products → Domain → DNS → Nameservers |
| **Namecheap** | Domain List → Manage → Nameservers → Custom DNS |
| **Google Domains** | DNS → Custom name servers |
| **Porkbun** | Domain Management → Nameservers |
| **Cloudflare Registrar** | Already on Cloudflare, just add the custom domain |

</details>

### Don't have a domain?

You can buy one from:
- [Cloudflare Registrar](https://dash.cloudflare.com/?to=/:account/domains/register) (~$10-15/year, no markup)
- [Namecheap](https://www.namecheap.com)
- [Porkbun](https://porkbun.com)

### What about www?

**Important:** `example.com` and `www.example.com` are treated as **different domains**. If you only set up `example.com`, visitors going to `www.example.com` will get an error.

**You have two options:**

<details>
<summary><b>Option A: Redirect www to non-www (Recommended)</b></summary>

This is the best approach for SEO — all traffic goes to one canonical URL.

1. Add `www.example.com` as another custom domain in Cloudflare (same steps as above)
2. Add this to your `nooxy/config.js`:
   ```javascript
   subDomains: {
     www: {
       redirect: 'https://example.com',  // www.example.com → example.com
     },
   },
   ```
3. Run:
   ```bash
   npx nooxy generate
   npm run deploy
   ```

Now `www.example.com` automatically redirects to `example.com`.

</details>

<details>
<summary><b>Option B: Make both domains work independently</b></summary>

If you want both `example.com` and `www.example.com` to serve your site (not redirect):

1. Add **both** as custom domains in Cloudflare:
   - Go to **Workers & Pages** → your worker → **Settings** → **Domains & Routes**
   - Add `example.com`
   - Add `www.example.com`
2. Set `domain` in `nooxy/config.js` to your preferred version:
   ```javascript
   domain: 'example.com',  // or 'www.example.com'
   ```

**Note:** This can hurt SEO because search engines see two separate sites with duplicate content. Option A is recommended.

</details>

---

## Adding More Pages

To add new pages to your site:

1. **Create** the page in Notion
2. **Publish** it (Share → Publish → Publish to web)
3. **Copy** the page ID from the URL
4. **Add** it to `slugToPage` in `nooxy/config.js`:
   ```javascript
   slugToPage: {
     '/': 'home-page-id',
     '/about': 'about-page-id',
     '/blog': 'blog-page-id',
     '/contact': 'your-new-page-id',  // ← Add new pages here
   },
   ```
5. **Generate and deploy**:
   ```bash
   npx nooxy generate
   npm run deploy
   ```

---

## Customizing Your Site

All customization files are in the `nooxy/` folder:

| File | Purpose | When it runs |
|------|---------|--------------|
| `config.js` | Main configuration (domain, pages, SEO) | — |
| `head.css` | Custom CSS styles | Injected into `<head>` |
| `head.js` | JavaScript for early execution | Runs before page loads |
| `body.js` | JavaScript for DOM manipulation | Runs after page loads |
| `header.html` | Custom HTML (navigation, banners) | Injected at top of page |

### How customization works

1. You edit the source files (`head.css`, `body.js`, etc.)
2. Run `npx nooxy generate` — this processes them into `nooxy/generated/` (which `config.js` imports)
3. Run `npm run deploy` — deploys the changes
4. Nooxy injects your customizations into every page

> **Important:** Run `npx nooxy generate` every time you change anything in the `nooxy/` folder. Your changes won't appear until you regenerate and redeploy.

**For detailed documentation on each file, examples, and all configuration options, see the main README:**
- [Project Files](https://github.com/draphy/nooxy#project-files) — how each file works, what to put in them
- [Configuration Reference](https://github.com/draphy/nooxy#configuration-reference) — all config options (SEO, social media, fonts, 404 pages, redirects, etc.)

---

## Updating Your Site

### Content changes (in Notion)

Changes to your Notion content appear **automatically** — no redeploy needed.

### Changes to `nooxy/` folder

Whenever you edit any file in the `nooxy/` folder (`config.js`, `head.css`, `body.js`, `head.js`, or `header.html`):

```bash
npx nooxy generate    # Process your changes
npm run deploy        # Deploy to Cloudflare
```

Your changes won't appear on the live site until you run both commands.

---

## Troubleshooting

### "Page not found" or 404 error

- [ ] Is your Notion page published? (Share → Publish → Publish to web)
- [ ] Is your page ID correct? It should be exactly 32 characters (letters a-f and numbers only)
- [ ] Does your `notionDomain` match your Notion workspace?

### "Cannot find module 'nooxy'"

Run `npm install nooxy` in your project folder.

### Site looks broken or unstyled

1. Run `npx nooxy generate`
2. Run `npm run deploy`
3. Clear your browser cache (or try incognito/private mode)

### Custom domain not working

- DNS changes can take up to 24 hours to propagate
- Check that your nameservers are correctly set at your registrar
- Verify the domain shows "Active" in your Cloudflare dashboard

### www.example.com doesn't work (but example.com does)

`www.example.com` and `example.com` are different domains. You need to set up both — see [What about www?](#what-about-www) above.

### Local server won't start

- Make sure you're in the `my-nooxy-site` folder (where `package.json` is)
- Try `npm install` to reinstall dependencies

---

## Quick Reference

| What you want to do | Command |
|---------------------|---------|
| Install Nooxy | `npm install nooxy` |
| Create config files | `npx nooxy init` |
| Process changes in `nooxy/` | `npx nooxy generate` |
| Test locally | `npm run dev` |
| Log in to Cloudflare | `npx wrangler login` |
| Deploy | `npm run deploy` |

For more CLI options, see [CLI Commands](https://github.com/draphy/nooxy#cli-commands) in the main README.

---

## Project Structure

```
my-nooxy-site/
├── src/
│   └── index.ts        # Worker code (connects Nooxy to Cloudflare)
├── nooxy/
│   ├── config.js       # Your site configuration
│   ├── head.css        # Custom CSS (optional)
│   ├── head.js         # JavaScript for <head> (optional)
│   ├── body.js         # JavaScript for <body> (optional)
│   └── header.html     # Custom header HTML (optional)
├── package.json
└── wrangler.jsonc      # Cloudflare configuration
```

---

## Need Help?

- **GitHub Issues**: [Report bugs or request features](https://github.com/draphy/nooxy/issues)
- **Discussions**: [Ask questions](https://github.com/draphy/nooxy/discussions)
- **Email**: contact@draphy.org

---

<div align="center">

**You did it!** Your Notion site is now live on your own domain.

[← Back to main README](https://github.com/draphy/nooxy)

</div>
