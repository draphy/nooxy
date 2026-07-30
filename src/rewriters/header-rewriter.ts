import { NooxySiteConfigFull } from '../types';

// Helper function to modify request headers
export function modifyRequestHeaders(headers: Headers): Headers {
  const newHeaders = new Headers(headers);
  // Dropped rather than forwarded, but this does NOT stop the upstream
  // compressing: undici puts its own `accept-encoding: gzip, deflate` back on
  // any request that lacks one. The response body therefore arrives decoded
  // while its content-encoding header survives, which is why every response
  // path has to strip that header — see modifyResponseHeaders.
  newHeaders.delete('accept-encoding');
  return newHeaders;
}

/**
 * Points a cookie's Domain attribute at the site's own host.
 *
 * Handles notion.site, notion.so and a single subdomain of either. The
 * replacement is a function so a `$` in the host — `$&`, `` $` ``, `$'` — is
 * inserted literally instead of expanding into part of the cookie.
 */
function rescopeCookieDomain(cookie: string, hostname: string): string {
  return cookie.replace(
    /((?:^|; )Domain=)(?:[^.]+\.)?notion\.(?:site|so)(;|$)/gi,
    (_match, prefix: string, suffix: string) => `${prefix}${hostname}${suffix}`,
  );
}

// Helper function to modify response headers
export function modifyResponseHeaders(
  headers: Headers,
  hostname: string,
  siteConfig?: NooxySiteConfigFull,
  bodyModified?: boolean,
): Headers {
  const newHeaders = new Headers(headers);

  // content-encoding is always wrong by the time we see it: fetch decompresses
  // the body but leaves the header in place, so forwarding it labelled decoded
  // bytes as gzip and the browser failed to decode them. That broke PDFs, fonts
  // and other attachments on a self-hosted Node deployment — invisible on
  // Cloudflare Workers, which strips the header itself.
  const wasEncoded = newHeaders.has('content-encoding');
  newHeaders.delete('content-encoding');

  // content-length only goes stale in the two cases where the body's length
  // actually changed: it was decompressed, or it was rewritten. Dropping it
  // unconditionally also stripped it from an uncompressed byte-for-byte
  // passthrough, where it was correct — losing the length on a 206 range response
  // and the progress indication on a large attachment.
  if (wasEncoded || bodyModified) {
    newHeaders.delete('content-length');
  }

  // These two describe the exact bytes, so they only go stale once the body is
  // actually rewritten. A byte-for-byte passthrough can keep them, which is what
  // lets conditional requests still work for images and attachments.
  if (bodyModified) {
    newHeaders.delete('content-digest');
    newHeaders.delete('etag');
  }

  // Handle cookies - rewrite Notion domain to custom domain.
  //
  // Each Set-Cookie must stay its own header. Headers.get() joins them with a
  // comma and set() writes a single header back, so the pair Notion sends for a
  // signed-in reader used to arrive as one malformed cookie and the second was
  // silently dropped. getSetCookie() keeps them apart; the joined value is only
  // a fallback for runtimes that predate it.
  const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')];

  if (cookies.some(Boolean)) {
    newHeaders.delete('set-cookie');
    for (const cookie of cookies) {
      if (cookie) {
        newHeaders.append('set-cookie', rescopeCookieDomain(cookie, hostname));
      }
    }
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
