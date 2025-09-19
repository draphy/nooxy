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

export function initializeNooxy(
  options: NooxySiteConfig | { configKey?: string; config: NooxySiteConfig },
): (request: Request) => Promise<Response> {
  let configKey = 'default';
  let config: NooxySiteConfig;

  if ('configKey' in options && 'config' in options) {
    configKey = options.configKey || 'default';
    config = options.config;
  } else {
    config = options as NooxySiteConfig;
  }

  const configManager = ConfigManager.getInstance(config, configKey);

  return async (request: Request): Promise<Response> => {
    const siteConfig = configManager.getConfig();
    const url = getUrlState(request.url);
    if (url.isLocalhost) {
      siteConfig.domain = url.domain;
    }
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
      return Response.redirect(sub.redirect, 301);
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

  if (url.pathname.endsWith('favicon.ico') && siteIcon) {
    return handleFavicon(siteIcon);
  }

  if (isNotion404(pathname, slugToPage)) {
    if (siteConfig.fof?.page?.length) {
      return Response.redirect(`${urlOrgState.protocol}//${domain}/${siteConfig.fof.page}`, 301);
    } else {
      console.error('!! Page Not found (404)', url.pathname);

      return new Response('Page Not found (404).', { status: 404 });
    }
  }

  // Modify request headers
  const modifiedHeaders = modifyRequestHeaders(request.headers);

  // Construct target URL
  const notionDomainUrl = new URL(ensureHttpsUrl(notionDomain)).origin;
  const targetPath = resolveProxyPath(pathname + url.search, slugToPage);
  const targetUrl = new URL(targetPath, notionDomainUrl);

  // Create proxied request
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: modifiedHeaders,
    body: request.body,
  });

  try {
    // Fetch from target
    const response = await fetch(proxyRequest);

    // Handle image requests - return as-is
    if (/^\/image[s]?\//.test(pathname)) {
      return response;
    }

    // For 304 Not Modified responses, return with null body
    if (response.status === 304) {
      const modifiedResponseHeaders = modifyResponseHeaders(response.headers, hostname);
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedResponseHeaders,
      });
    }

    // Get response data
    const data = await response.text();

    // Modify response data
    const modifiedData = modifyResponseData(data, pathname, siteConfig, urlOrgState.protocol);

    // Modify response headers
    const modifiedResponseHeaders = modifyResponseHeaders(response.headers, hostname);

    return new Response(modifiedData, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedResponseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);

    // If all retries failed and we have a 404 page configured, redirect to it
    if (siteConfig.fof?.page?.length) {
      return Response.redirect(`${urlOrgState.protocol}//${siteConfig.domain}/${siteConfig.fof.page}`, 302);
    }

    // Otherwise return a proper 404 response
    return new Response('Page temporarily unavailable. Please try again.', {
      status: 503,
      headers: { 'Retry-After': '5' },
    });
  }
}
