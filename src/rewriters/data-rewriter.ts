import { ensureHttpsUrl } from '../helpers';
import { NooxySiteConfigFull } from '../types';
import { HEAD_JS_STRING } from './custom/generated/_head-js-string';
import { HEAD_CSS_STRING } from './custom/generated/_head-css-string';
import { rewriteMetaTags } from './meta-rewriter';

// Helper function to modify response data
export function modifyResponseData(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
): string {
  const {
    notionDomain,
    slugToPage,
    pageToSlug,
    googleTagID,
    customHeader,
    customHeadCSS,
    customHeadJS,
    customBodyJS,
    googleFont,
  } = siteConfig;
  let data = responseData;
  const notionDomainUrl = new URL(ensureHttpsUrl(notionDomain)).origin;
  const customJSCode = `var notionDomain='${notionDomainUrl}',slugToPage=${JSON.stringify(slugToPage)},pageToSlug=${JSON.stringify(pageToSlug)},customHeader='${customHeader}';${HEAD_JS_STRING}`;
  const googleFontInject = googleFont
    ? `<link href='https://fonts.googleapis.com/css?family=${googleFont.replace(
        ' ',
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

  if (/^\/_assets\/[^/]*\.js$/.test(pathname)) {
    data = data.replace(/window\.location\.href(?=[^=]|={2,})/g, 'window.nooxy.href()'); // Exclude 'window.location.href=' but not 'window.location.href=='
  } else if (data.includes('<html') || data.includes('<!DOCTYPE')) {
    // Assume HTML
    // Apply meta tag rewriting
    data = rewriteMetaTags(data, pathname, siteConfig, protocol)
      .replace(
        '</head>',
        `${googleFontInject}<script>${customHeadJS}</script><script>${customJSCode}</script><style>${customHeadCSS}</style><style>${HEAD_CSS_STRING}</style></head>`,
      )
      .replace('</body>', `<script>${customBodyJS}</script>${ga}</body>`);
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
