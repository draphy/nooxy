export * from './config-loader';

export function ensureHttpsUrl(url: string) {
  const input = url.trim();
  if (input.startsWith('https://')) {
    return input;
  }
  if (input.startsWith('http://')) {
    return `https://${input.slice(7)}`;
  }
  return `https://${input}`;
}

// Helper function to resolve proxy path
export function resolveProxyPath(url: string, slugToPage: Record<string, string>): string {
  const slug = extractSlug(url);
  if (!slug) {
    return url;
  }
  const pageId = slugToPage[slug];
  if (pageId) {
    const regex = new RegExp(`${escapeRegExp(slug)}(?=\\?|$)`);
    return url.replace(regex, `/${pageId}`);
  }
  return url;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSlug(url: string) {
  if (url.startsWith('/')) {
    return url.split('?')[0];
  }
  try {
    const u = new URL(url);
    return u.pathname;
  } catch (_e) {
    return url.split('?')[0];
  }
}

// Helper function to handle pseudo endpoints
export function handlePseudoEndpoint(url: string): Response | null {
  if (/^\/200\/?/.test(url)) {
    if (url.startsWith('/200/www.notion.so/api/v3/')) {
      return new Response('success', { status: 200 });
    } else if (url.startsWith('/200/exp.notion.so/v1/')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(null, { status: 200 });
    }
  }
  return null;
}

export const getUrlState = (url: string) => {
  const urlObj = new URL(url);
  const isLocalhost = checkLocalhost(urlObj.hostname);
  return {
    isLocalhost,
    protocol: urlObj.protocol,
    port: urlObj.port,
    domain: isLocalhost ? `${urlObj.hostname}:${urlObj.port}` : urlObj.hostname,
  };
};

const checkLocalhost = (hostname: string) => localhost.includes(hostname);
const localhost = ['localhost', '127.0.0.1', '::1'];
const STATIC_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico']);
const STATIC_ASSETS_REGEX = /^\/(_assets|image|f\/refresh)/;
const FILE_EXTENSION_REGEX = /\.[a-zA-Z]{2,4}$/;

export function isNotion404(pathname: string, slugToPage: Record<string, string>) {
  if (STATIC_PATHS.has(pathname)) {
    return false;
  }
  if (
    pathname.startsWith('/api') ||
    pathname.endsWith('.js') ||
    (pathname.startsWith('/app') && pathname.endsWith('.js')) ||
    STATIC_ASSETS_REGEX.test(pathname) ||
    FILE_EXTENSION_REGEX.test(pathname)
  ) {
    return false;
  }
  const lastSlashIndex = pathname.lastIndexOf('/');
  const slugSlash = lastSlashIndex === -1 ? pathname : pathname.slice(lastSlashIndex + 1);
  const lastHyphenIndex = slugSlash.lastIndexOf('-');
  const slug = lastHyphenIndex === -1 ? slugSlash : slugSlash.slice(lastHyphenIndex + 1);
  if (!slug) {
    return false;
  }
  const page = slugToPage[`/${slug}`];
  const notValidSlug = slug.length !== 32;
  if (!page && notValidSlug) {
    return true;
  }
  return false;
}

// Helper function to extract page ID from pathname
export function extractPageId(input: string) {
  const path = input.split('?')[0];
  const match = path?.match(/([a-fA-F0-9]{32})(?=\/?$)/);
  return match?.[1] ? match[1] : '';
}

// Helper function to remove Notion branding from text
export function removeNotionAds(text: string) {
  return text
    .replace(' | Built with Notion', '')
    .replace(' | Notion', '')
    .replace('Built with Notion, the all-in-one connected workspace with publishing capabilities.', '');
}
