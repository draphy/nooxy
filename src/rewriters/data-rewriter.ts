import { ensureHttpsUrl } from '../helpers';
import { NooxySiteConfigFull } from '../types';
import { HEAD_JS_STRING } from './custom/generated/_head-js-string';
import { HEAD_CSS_STRING } from './custom/generated/_head-css-string';
import { rewriteMetaTags } from './meta-rewriter';

// Bump when patching logic changes (regex patterns, HEAD_JS_STRING, HEAD_CSS_STRING)
const ASSET_PATCH_VERSION = '1';
const INTERSTITIAL_API_PATHS = new Set(['/api/v3/getPublicPageData', '/api/v3/getPublicPageDataForDomain']);

/**
 * JSON for embedding inside a <script> element.
 *
 * JSON.stringify does not escape '<', so a slug containing "</script>" closed the
 * element and turned the rest of the page into live markup. Escaping '<' keeps
 * the value byte-identical to the parser while making that impossible.
 * meta-rewriter.ts does the same for its ld+json blocks.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

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

/**
 * Whether this body should be treated as an HTML document.
 *
 * The content type decides. Sniffing the body for '<html' anywhere — which is
 * what this used to do — also matched a JSON API response whose page content
 * happened to contain that text, and the meta rewriter then wrote tags into it
 * and broke the JSON.
 */
function isHtmlDocument(contentType: string, data: string): boolean {
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return true;
  }

  // No content type at all: fall back to markup, but only where a real document
  // declares itself, at the very start.
  return contentType === '' && /^\s*(?:<!DOCTYPE\s+html|<html[\s>])/i.test(data);
}

function removePublicDomainInterstitial(responseData: string): string {
  if (!responseData.includes('requireInterstitial')) {
    return responseData;
  }
  try {
    const payload = JSON.parse(responseData) as Record<string, unknown>;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return responseData;
    }
    if (!('requireInterstitial' in payload)) {
      return responseData;
    }
    payload.requireInterstitial = undefined;
    return JSON.stringify(payload);
  } catch {
    return responseData;
  }
}

// Helper function to modify response data
export function modifyResponseData(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
  contentType = '',
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
  const customJSCode = `var notionDomain='${notionDomainUrl}',slugToPage=${jsonForScript(slugToPage)},pageToSlug=${jsonForScript(pageToSlug)},customHeader='${safeCustomHeader}',showBadge=${showBadge};${HEAD_JS_STRING}`;
  // These two land in an HTML attribute, a CSS declaration and a JS string
  // literal. Rather than escape for three contexts, restrict them to the
  // characters the values can legitimately contain: a Google Font family name
  // and a GA measurement ID. Anything else is dropped.
  const safeGoogleFont = googleFont ? googleFont.replace(/[^A-Za-z0-9 -]/g, '') : '';
  const safeGoogleTagID = googleTagID ? googleTagID.replace(/[^A-Za-z0-9_-]/g, '') : '';

  const googleFontInject = safeGoogleFont
    ? `<link href='https://fonts.googleapis.com/css?family=${safeGoogleFont.replace(
        / /g,
        '+',
      )}:Regular,Bold,Italic&display=swap' rel='stylesheet'>
          <style>* { font-family: "${safeGoogleFont}" !important; }</style>`
    : '';
  const ga = safeGoogleTagID
    ? `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${safeGoogleTagID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', '${safeGoogleTagID}');
    </script>`
    : '';

  // Telemetry hosts are handled in two live places rather than here: head.js's
  // isSuppressedUrl drops them in the browser before a request is made, and the
  // /200/ rewrite at the end of this function catches the two that still reach
  // the proxy. A commented-out keyword list used to sit here for investigation;
  // it only duplicated those two lists, so it is in git history instead.

  if (INTERSTITIAL_API_PATHS.has(pathname)) {
    data = removePublicDomainInterstitial(data);
  }

  // IMPORTANT: This must happen BEFORE script injection to avoid replacing the notionDomain variable
  const escapedNotionDomain = notionDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const notionDomainPattern = new RegExp(`https?://${escapedNotionDomain}(?=[/?"'>#\\s]|$)`, 'gi');

  if (/^\/_assets\/.+\.js$/.test(pathname)) {
    // Patch Notion's JS bundles for proxy compatibility
    data = data
      // Update existing nooxy cache-bust params to current version
      .replace(/([?&])nooxy=\d+/g, `$1nooxy=${ASSET_PATCH_VERSION}`)
      // Exclude assignments like window.location.href=, but keep reads and comparisons patched.
      .replace(/window\.location\.href(?=[^=]|={2,})/g, 'window.nooxy.href()')
      // Patch Notion's domain config to use proxy origin instead of notion.so
      .replace(/([{,]baseUrl):[a-zA-Z_$][\w$.]*\.domainBaseUrl\b/g, '$1:new URL(window.nooxy.href()).origin')
      .replace(/([{,]publicDomainName):[a-zA-Z_$][\w$.]*\.publicDomainName\b/g, '$1:void 0')
      // Patch webpack chunk loader to add cache-bust param to dynamic script URLs
      // Matches: .src=url),chunks[id]=[ → .src=url+(url.indexOf("?")===-1?"?nooxy=1":"&nooxy=1"),chunks[id]=[
      .replace(
        /(\.src=)([a-zA-Z_$][\w$]*)(\),[a-zA-Z_$][\w$]*\[[a-zA-Z_$][\w$]*\]=\[)/g,
        `$1$2+($2.indexOf("?")===-1?"?nooxy=${ASSET_PATCH_VERSION}":"&nooxy=${ASSET_PATCH_VERSION}")$3`,
      );
  } else if (isHtmlDocument(contentType, data)) {
    // Apply meta tag rewriting first
    data = rewriteMetaTags(data, pathname, siteConfig, protocol);

    // Replace notion domain URLs in the original HTML content (before script injection).
    //
    // The replacements in *this* chain use replacer functions, because each one
    // carries a config value and '$&', '$`', "$'" or '$n' inside it would
    // otherwise be expanded as a substitution pattern. The two at the end of this
    // function are deliberately different: they use replacement strings where
    // '$1' and '$&' are load-bearing. Do not convert those.
    data = data.replace(notionDomainPattern, () => `${protocol}//${targetDomain}`);

    data = data
      .replace(
        /(<script\b[^>]*\bsrc=["'])(\/_assets\/[^"']*\.js[^"']*)(["'][^>]*>)/gi,
        (_match, prefix, src, suffix) => {
          if (src.includes('nooxy=')) {
            return `${prefix}${src}${suffix}`;
          }
          const separator = src.includes('?') ? '&' : '?';
          return `${prefix}${src}${separator}nooxy=${ASSET_PATCH_VERSION}${suffix}`;
        },
      )
      .replace(
        /<\/head>/i,
        () =>
          `${googleFontInject}<script>${customHeadJS}</script><script>${customJSCode}</script><style>${customHeadCSS}</style><style>${HEAD_CSS_STRING}</style></head>`,
      )
      .replace(/<\/body>/i, () => `<script>${customBodyJS}</script>${ga}</body>`);
  }

  return (
    data
      // https://aif.notion.so/**      -> /200/aif.notion.so/**
      // https://widget.intercom.io/** -> /200/widget.intercom.io/**
      //
      // The character class stops at a quote of any kind. It used to exclude only
      // '"' and a backtick, so inside single-quoted minified JS the match ran past
      // the closing quote — harmless in itself, since $1 puts the text back
      // verbatim, but it swallowed any further URL in the same span and left that
      // one unrewritten.
      .replace(/https:\/\/((aif\.notion\.so|widget\.intercom\.io)\/?[^"'`\s]*)/g, `/200/$1`)
      // Neutralise Sentry.init() so telemetry never initialises.
      //
      // The callee is replaced with a no-op object, which is a value and so parses
      // in every position. Two earlier forms each broke half the cases:
      //
      //   'return;$&'  only parses where the call is a statement, so
      //                `var s=(Sentry.init({dsn:` became `var s=(return;Sentry…`
      //   \w+ alone    matches only the last identifier, so
      //                `window.Sentry.init(` became `window.({init:…}).init(` —
      //                and a dotted callee is the common shape in minified code
      //
      // Matching the whole dotted chain fixes both: `window.Sentry` is replaced
      // entire, leaving `({init:function(){}}).init({dsn:…})`.
      .replace(/[\w$]+(?:\.[\w$]+)*(?=\.init\({dsn:)/, '({init:function(){}})')
  );
}
