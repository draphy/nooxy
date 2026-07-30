import { handleFavicon, handleSitemap, handleOptions } from './handlers';
import {
  ensureHttpsUrl,
  getUrlState,
  handlePseudoEndpoint,
  isNotion404,
  resolveProxyPath,
  ConfigManager,
} from './helpers';
import { modifyRequestHeaders, modifyResponseData, modifyResponseHeaders } from './rewriters';
import { NooxySiteConfig, NooxySiteConfigFull } from './types';

// Content types that require proxy rewriting (HTML injection, URL rewriting, etc.)
const TEXTUAL_CONTENT_TYPES = /text\/html|text\/css|javascript|application\/json|\bxml\b/i;

// Ceiling on a single upstream request to Notion. Generous enough for a cold
// page load, bounded so a self-hosted deployment cannot accumulate connections
// waiting on an upstream that never answers.
const UPSTREAM_TIMEOUT_MS = 20000;

export function initializeNooxy(
  options: NooxySiteConfig | { configKey?: string; config: NooxySiteConfig },
): (request: Request) => Promise<Response> {
  let explicitKey: string | undefined;
  let config: NooxySiteConfig;

  if ('configKey' in options && 'config' in options) {
    explicitKey = options.configKey || undefined;
    config = options.config;
  } else {
    config = options as NooxySiteConfig;
  }

  // Falls back to the site's own domain rather than a shared 'default'.
  //
  // ConfigManager caches per key and ignores the config argument once a key
  // exists, so two initializeNooxy calls without a configKey used to share one
  // instance: the second site silently served the first site's domain, sitemap
  // and canonical URLs. configKey is documented in neither README, so following
  // the docs produced exactly that. Keying on the domain makes distinct sites
  // distinct by default, and an explicit key still wins.
  const configKey = explicitKey ?? config.domain ?? 'default';

  const configManager = ConfigManager.getInstance(config, configKey);

  return async (request: Request): Promise<Response> => {
    const cachedConfig = configManager.getConfig();
    const url = getUrlState(request.url);

    // Serving from localhost means the configured domain is not the one in play,
    // so it is swapped for the request's. That override belongs to this request
    // only: writing it back to the cached config would leave every later request
    // on this instance advertising localhost in its canonical URLs, sitemap and
    // redirects. Relevant beyond local development, since a Node deployment
    // behind a reverse proxy can legitimately see 127.0.0.1 as the host.
    const siteConfig = url.isLocalhost ? { ...cachedConfig, domain: url.domain } : cachedConfig;

    return reverseProxy(request, siteConfig);
  };
}

async function reverseProxy(request: Request, siteConfig: NooxySiteConfigFull): Promise<Response> {
  const { notionDomain, domain, siteIcon, slugToPage } = siteConfig;

  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  const url = new URL(request.url);
  const subDomain = url.hostname.split('.')[0];
  const hostname = url.hostname;

  if (hostname !== domain.split(':')[0] && subDomain && siteConfig.subDomains) {
    const sub = siteConfig.subDomains[subDomain];

    if (sub) {
      // Validated before use: Response.redirect throws a TypeError on anything
      // it cannot parse, and this value comes straight from the site config, so a
      // typo reached the visitor as an unhandled crash rather than a page.
      try {
        return Response.redirect(new URL(sub.redirect).toString(), 301);
      } catch {
        console.error(`!! Invalid subDomains["${subDomain}"].redirect in site config:`, sub.redirect);

        return new Response('Site is misconfigured.', { status: 500 });
      }
    }
  }

  const pathname = url.pathname;

  // Handle pseudo endpoints
  const pseudoResponse = handlePseudoEndpoint(pathname);
  if (pseudoResponse) {
    return pseudoResponse;
  }

  const urlOrgState = getUrlState(request.url);

  // Handle special Notion routes
  if (pathname === '/robots.txt') {
    return new Response(`Sitemap: ${urlOrgState.protocol}//${domain}/sitemap.xml`);
  }

  if (url.pathname === '/sitemap.xml') {
    return handleSitemap(siteConfig, urlOrgState.protocol);
  }

  // Match on the whole segment: "endsWith('favicon.ico')" also caught paths such
  // as "/not-a-favicon.ico". A configured icon that cannot be served falls
  // through to the proxied Notion favicon rather than failing the request.
  if (url.pathname.endsWith('/favicon.ico') && siteIcon) {
    const icon = await handleFavicon(siteIcon);
    if (icon) {
      return icon;
    }
  }

  if (isNotion404(pathname, slugToPage)) {
    if (siteConfig.fof?.page?.length) {
      // Redirect to the configured slug, not the raw page id: ConfigManager maps
      // the slug to the same page, and sending the id would put a 32-character
      // hex string in the visitor's address bar.
      return Response.redirect(`${urlOrgState.protocol}//${domain}${siteConfig.fof.slug ?? '/404'}`, 301);
    } else {
      console.error('!! Page Not found (404)', url.pathname);

      return new Response('Page Not found (404).', { status: 404 });
    }
  }

  // Modify request headers
  const modifiedHeaders = modifyRequestHeaders(request.headers);

  // Construct target URL. A notionDomain that cannot be parsed is a deployment
  // mistake, so it is reported as a server error rather than thrown: an
  // unhandled TypeError here surfaces to visitors as a stack trace.
  let notionDomainUrl: string;
  try {
    notionDomainUrl = new URL(ensureHttpsUrl(notionDomain)).origin;
  } catch {
    console.error('!! Invalid notionDomain in site config:', notionDomain);

    return new Response('Site is misconfigured.', { status: 500 });
  }

  const targetPath = resolveProxyPath(pathname + url.search, slugToPage);
  const targetUrl = new URL(targetPath, notionDomainUrl);

  // A path is resolved against the Notion origin, and a scheme-relative one such
  // as "//evil.com/x" resolves to a different host entirely. Without this check
  // the proxy would fetch that host and serve its response from your domain.
  if (targetUrl.origin !== notionDomainUrl) {
    console.error('!! Blocked request that resolved outside the Notion origin', pathname);

    return new Response('Page Not found (404).', { status: 404 });
  }

  // Create proxied request.
  //
  // `duplex: 'half'` is required by the WHATWG fetch spec whenever a stream is
  // used as a body, and Node enforces it — without it every request carrying a
  // body throws "duplex option is required when sending a body". Notion loads
  // all page content over POST /api/v3/..., so on a self-hosted Node deployment
  // that meant no content ever loaded. Cloudflare Workers does not require the
  // option, and ignores it, so passing it is safe on both.
  //
  // It is only set when there is a body: supplying it for a GET is pointless,
  // and some runtimes reject a body-less request that declares a duplex mode.
  const hasBody = request.body !== null && request.method !== 'GET' && request.method !== 'HEAD';
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: modifiedHeaders,
    ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
  } as RequestInit);

  try {
    // Fetch from target.
    //
    // Bounded on purpose. Cloudflare Workers imposes its own wall clock, but a
    // self-hosted Node deployment has none — a Notion request that never answers
    // would hold the connection, and its retry, indefinitely.
    const response = await fetch(proxyRequest, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });

    // Handle image requests - return as-is
    if (/^\/image[s]?\//.test(pathname)) {
      return response;
    }

    // For 304 Not Modified responses, return with null body
    // Must check before binary passthrough since 304 responses have no body
    if (response.status === 304) {
      const modifiedResponseHeaders = modifyResponseHeaders(response.headers, hostname, siteConfig);
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedResponseHeaders,
      });
    }

    // Non-textual responses (PDFs, fonts, and other file attachments) must be
    // streamed through untouched. Reading a binary body with response.text() does a
    // lossy UTF-8 decode/re-encode round-trip that corrupts the bytes, so the browser
    // receives a broken file and can't render it. Only HTML/CSS/JS/JSON/XML get
    // rewritten below. Missing content-type defaults to binary passthrough (fail-safe).
    const contentType = response.headers.get('content-type') || '';
    const isTextual = TEXTUAL_CONTENT_TYPES.test(contentType);
    if (!isTextual) {
      const passthroughHeaders = modifyResponseHeaders(response.headers, hostname, siteConfig);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: passthroughHeaders,
      });
    }

    // Get response data
    const data = await response.text();

    // Modify response data
    // contentType is passed so HTML is identified by what the upstream said it
    // is, not by whether '<html' happens to appear somewhere in the body.
    const modifiedData = modifyResponseData(data, targetUrl.pathname, siteConfig, urlOrgState.protocol, contentType);

    // Modify response headers (bodyModified=true removes stale content headers)
    const modifiedResponseHeaders = modifyResponseHeaders(response.headers, hostname, siteConfig, true);

    return new Response(modifiedData, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedResponseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);

    // A 503, not a redirect to the 404 page.
    //
    // This used to 302 to fof.slug whenever one was configured, which told the
    // visitor and every crawler that the page does not exist — when in fact the
    // upstream timed out or the network failed. It also discarded the URL they
    // asked for, so a reload could not recover. There are no retries here despite
    // what this comment used to claim; the single upstream attempt is bounded by
    // UPSTREAM_TIMEOUT_MS.
    return new Response('Page temporarily unavailable. Please try again.', {
      status: 503,
      headers: { 'Retry-After': '5' },
    });
  }
}
