import { NooxySiteConfigFull } from '../types';

// Helper function to modify request headers
export function modifyRequestHeaders(headers: Headers): Headers {
  const newHeaders = new Headers(headers);
  newHeaders.delete('accept-encoding');
  return newHeaders;
}

// Helper function to modify response headers
export function modifyResponseHeaders(headers: Headers, hostname: string, siteConfig?: NooxySiteConfigFull): Headers {
  const newHeaders = new Headers(headers);

  // Handle cookies - rewrite Notion domain to custom domain
  const cookies = headers.get('set-cookie');
  if (cookies) {
    // Note: set-cookie can have multiple values, but Headers.get() returns them comma-separated
    // Handle various Notion domain patterns:
    // - notion.site, *.notion.site
    // - notion.so, *.notion.so
    // - www.notion.so
    const modifiedCookies = cookies.replace(
      /((?:^|; )Domain=)(?:[^.]+\.)?notion\.(?:site|so)(;|$)/gi,
      `$1${hostname}$2`,
    );
    newHeaders.set('set-cookie', modifiedCookies);
  }

  // This allows embedding the proxied site in iframes
  newHeaders.delete('x-frame-options');

  // Handle CSP - add common domains that might be used by proxied sites
  const csp = headers.get('content-security-policy');
  if (csp) {
    let modifiedCsp = csp
      .replace(
        /(?=(script-src|connect-src) )[^;]*/g,
        '$& https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://cloudflareinsights.com',
      )
      .replace(/(?=(style-src) )[^;]*/g, '$& https://fonts.googleapis.com')
      .replace(/(?=(font-src) )[^;]*/g, '$& https://fonts.gstatic.com')
      .replace(/frame-ancestors[^;]*/g, 'frame-ancestors *');
    // Force frame-ancestors to *
    if (!/frame-ancestors/.test(modifiedCsp)) {
      modifiedCsp += '; frame-ancestors *';
    }
    newHeaders.set('content-security-policy', modifiedCsp);
  }

  if (siteConfig?.seo?.indexing !== false) {
    newHeaders.set('X-Robots-Tag', 'index, follow');
  }

  return newHeaders;
}
