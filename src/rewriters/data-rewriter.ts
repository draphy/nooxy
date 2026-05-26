import { ensureHttpsUrl } from '../helpers';
import { NooxySiteConfigFull } from '../types';
import { HEAD_JS_STRING } from './custom/generated/_head-js-string';
import { HEAD_CSS_STRING } from './custom/generated/_head-css-string';
import { rewriteMetaTags } from './meta-rewriter';

const ASSET_PATCH_VERSION = '1';

function escapeForJS(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .replace(/</g, '\\x3c') // Escape < to prevent </script> injection
    .replace(/>/g, '\\x3e'); // Escape > for safety
}

function removePublicDomainInterstitial(responseData: string): string {
  try {
    const payload = JSON.parse(responseData) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(payload, 'requireInterstitial')) {
      return responseData;
    }

    payload.requireInterstitial = undefined;
    return JSON.stringify(payload);
  } catch (_error) {
    return responseData;
  }
}

// Helper function to modify response data
export function modifyResponseData(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
): string {
  const {
    domain,
    notionDomain,
    slugToPage,
    pageToSlug,
    googleTagID,
    customHeader,
    customHeadCSS,
    customHeadJS,
    customBodyJS,
    googleFont,
    seo,
    nooxy,
  } = siteConfig;
  let data = responseData;
  const notionDomainUrl = new URL(ensureHttpsUrl(notionDomain)).origin;

  const targetDomain = seo?.canonicalDomain || domain;
  const safeCustomHeader = escapeForJS(customHeader || '');
  const showBadge = nooxy?.showBadge !== false; // Default: true
  const customJSCode = `var notionDomain='${notionDomainUrl}',slugToPage=${JSON.stringify(slugToPage)},pageToSlug=${JSON.stringify(pageToSlug)},customHeader='${safeCustomHeader}',showBadge=${showBadge};${HEAD_JS_STRING}`;
  const googleFontInject = googleFont
    ? `<link href='https://fonts.googleapis.com/css?family=${googleFont.replace(
        / /g,
        '+',
      )}:Regular,Bold,Italic&display=swap' rel='stylesheet'>
          <style>* { font-family: "${googleFont}" !important; }</style>`
    : '';
  const ga = googleTagID
    ? `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${googleTagID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', '${googleTagID}');
    </script>`
    : '';

  // For investigation
  // const keywords: string[] = [
  //   // 'teV1',
  //   // 'aif.notion.so',
  //   // 'exp.notion.so',
  //   // 'msgstore.www.notion.so',
  //   // 'primus',
  //   // 'widget.intercom.io',
  //   // 'ingest.sentry.io',
  //   // 'envelope',
  //   // 'dsn',
  //   // 'splunkcloud.com',
  //   // 'statsigapi.net',
  // ]

  // const found = keywords.reduce((acc: string[], keyword) => (data.includes(keyword) ? [...acc, keyword] : acc), [])

  // if (found.length > 0) {
  //   // console.log('[DEBUG]', pathname, found);
  // }

  if (pathname === '/api/v3/getPublicPageData' || pathname === '/api/v3/getPublicPageDataForDomain') {
    data = removePublicDomainInterstitial(data);
  }

  // IMPORTANT: This must happen BEFORE script injection to avoid replacing the notionDomain variable
  const escapedNotionDomain = notionDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const notionDomainPattern = new RegExp(`https?://${escapedNotionDomain}(?=[/?"'>#\\s]|$)`, 'gi');

  if (/^\/_assets\/.+\.js$/.test(pathname)) {
    data = data
      .replace(/nooxy=\d+/g, `nooxy=${ASSET_PATCH_VERSION}`)
      // Exclude assignments like window.location.href=, but keep reads and comparisons patched.
      .replace(/window\.location\.href(?=[^=]|={2,})/g, 'window.nooxy.href()')
      .replace(
        /baseUrl:[^,;{}]+\.domainBaseUrl,publicDomainName:[^,;{}]+\.publicDomainName/g,
        'baseUrl:new URL(window.nooxy.href()).origin,publicDomainName:void 0',
      )
      .replace(
        /(\.src=)([a-zA-Z_$][\w$]*)(\),[a-zA-Z_$][\w$]*\[[a-zA-Z_$][\w$]*\]=\[)/g,
        `$1$2+($2.indexOf("?")===-1?"?nooxy=${ASSET_PATCH_VERSION}":"&nooxy=${ASSET_PATCH_VERSION}")$3`,
      );
  } else if (/<html/i.test(data) || /<!DOCTYPE/i.test(data)) {
    // Assume HTML (case-insensitive check for <html> and <!DOCTYPE>)
    // Apply meta tag rewriting first
    data = rewriteMetaTags(data, pathname, siteConfig, protocol);

    // Replace notion domain URLs in the original HTML content (before script injection)
    data = data.replace(notionDomainPattern, `${protocol}//${targetDomain}`);

    data = data
      .replace(/(<script\b[^>]*\bsrc=["'])(\/_assets\/[^"']+\.js)(["'][^>]*>)/gi, (_match, prefix, src, suffix) => {
        const separator = src.includes('?') ? '&' : '?';
        return `${prefix}${src}${separator}nooxy=${ASSET_PATCH_VERSION}${suffix}`;
      })
      .replace(
        /<\/head>/i,
        `${googleFontInject}<script>${customHeadJS}</script><script>${customJSCode}</script><style>${customHeadCSS}</style><style>${HEAD_CSS_STRING}</style></head>`,
      )
      .replace(/<\/body>/i, `<script>${customBodyJS}</script>${ga}</body>`);
  }

  return (
    data
      // https://aif.notion.so/**      -> /200/aif.notion.so/**
      // https://widget.intercom.io/** -> /200/widget.intercom.io/**
      .replace(/https:\/\/((aif\.notion\.so|widget\.intercom\.io)\/?[^"`]*)/g, `/200/$1`)
      // Skip Sentry.init()
      .replace(/\w+\.init\({dsn:/, 'return;$&')
  );
}
