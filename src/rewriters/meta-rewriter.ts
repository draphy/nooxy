import { extractPageId } from '../helpers';
import { NooxySiteConfigFull } from '../types';

// Rewrite meta tags and page metadata
export function rewriteMetaTags(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
): string {
  const { siteName, domain, pageToSlug, pageMetadata, twitterHandle } = siteConfig;
  const pageId = extractPageId(pathname);
  const isRootPage = pageToSlug[pageId] === '/';

  const pageMeta = pageMetadata?.[pageId];
  const pageTitle = pageMeta?.title;
  const pageDescription = pageMeta?.description;
  const pageImage = pageMeta?.image;
  const pageAuthor = pageMeta?.author;

  const finalUrl = isRootPage
    ? `${protocol}//${domain}/`
    : pageToSlug[pageId]
      ? `${protocol}//${domain}${pageToSlug[pageId]}`
      : `${protocol}//${domain}/${pageId}`;

  let result = responseData
    .replace(
      /<meta\s+name="twitter:site"\s+content="[^"]*"\s*\/?>/gi,
      twitterHandle ? `<meta name="twitter:site" content="${twitterHandle}"/>` : '',
    )
    .replace(
      /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/gi,
      `<meta name="twitter:url" content="${finalUrl}"/>`,
    )
    .replace(
      /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/gi,
      `<meta property="og:site_name" content="${siteName}"/>`,
    )
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/gi, `<meta property="og:url" content="${finalUrl}"/>`)
    .replace(/<meta\s+(?:name|property)="apple-itunes-app"[^>]*\/?>/gi, '')
    .replace(
      /<noscript><meta\s+http-equiv=(['"])refresh\1\s+content=(['"])0;url=https?:\/\/[^"]*disabled-javascript\.html\2\s*\/?><\/noscript>/gi,
      `<noscript><meta http-equiv="refresh" content="0;url=${finalUrl.replace(/\/$/, '')}/disabled-javascript.html"/></noscript>`,
    )

    // Handle JSON-LD schema
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, (match) => {
      try {
        const jsonMatch = match.match(/>(\s*\{[\s\S]*?\})\s*</);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[1] ?? '');
          if (jsonData['@type'] === 'WebSite') {
            jsonData.name = siteName;
            jsonData.url = finalUrl;
            return `<script type="application/ld+json">${JSON.stringify(jsonData)}</script>`;
          }
        }
      } catch (e) {
        console.warn('Failed to parse JSON-LD:', e);
      }
      return match;
    });

  // If no JSON-LD exists, inject one at the beginning of head for better crawler priority
  if (!/<script type="application\/ld\+json">/i.test(result)) {
    const websiteSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: finalUrl,
    };

    result = result.replace(
      /(<head[^>]*>)/i,
      `$1\n<script type="application/ld+json">${JSON.stringify(websiteSchema)}</script>`,
    );
  }

  if (pageImage) {
    result = result
      .replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/gi,
        `<meta property="og:image" content="${pageImage}"/>`,
      )
      .replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/gi,
        `<meta name="twitter:image" content="${pageImage}"/>`,
      );
  }

  if (pageTitle) {
    result = result
      .replace(/<title>[^<]*<\/title>/gi, `<title>${pageTitle}</title>`)
      .replace(
        /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/gi,
        `<meta name="twitter:title" content="${pageTitle}"/>`,
      )
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/gi,
        `<meta property="og:title" content="${pageTitle}"/>`,
      );
  }
  if (pageDescription) {
    result = result
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi,
        `<meta name="description" content="${pageDescription}"/>`,
      )
      .replace(
        /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/gi,
        `<meta name="twitter:description" content="${pageDescription}"/>`,
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/gi,
        `<meta property="og:description" content="${pageDescription}"/>`,
      );
  }

  if (pageAuthor) {
    if (/<meta\s+name="article:author"/i.test(result)) {
      result = result.replace(
        /<meta\s+name="article:author"\s+content="[^"]*"\s*\/?>/gi,
        `<meta name="article:author" content="${pageAuthor}"/>`,
      );
    } else {
      result = result.replace(
        /(<meta property="og:locale" content="[^"]*"\s*\/?>)/,
        `$1\n<meta name="article:author" content="${pageAuthor}"/>`,
      );
    }
  }

  return result;
}
