import { extractPageId } from '../helpers';
import { NooxySiteConfigFull } from '../types';

function getCanonicalUrl(
  protocol: string,
  domain: string,
  slug: string,
  pageId: string,
  siteConfig: NooxySiteConfigFull,
): string {
  const { seo } = siteConfig;
  const canonicalDomain = seo?.canonicalDomain;
  const canonicalPathMap = seo?.canonicalPathMap;

  const path = slug === '/' ? '/' : slug || `/${pageId}`;
  const targetDomain = canonicalDomain || domain;
  const finalPath = canonicalDomain && canonicalPathMap?.[path] ? canonicalPathMap[path] : path;

  return `${protocol}//${targetDomain}${finalPath}`;
}

function replaceBranding(text: string, replacement: string): string {
  return text.replace(/\bNotion\b/g, replacement);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper to create flexible meta tag pattern that handles:
// - Single or double quotes
// - Any attribute order
// - Extra whitespace (but NOT newlines - prevents cross-tag matching)
// - Self-closing or not
function createMetaPattern(nameOrProperty: 'name' | 'property', value: string): RegExp {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<meta[^>]*${nameOrProperty}=["']${escapedValue}["'][^>]*\\/?>`, 'gi');
}

// Rewrite meta tags and page metadata
export function rewriteMetaTags(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
): string {
  const { siteName, domain, pageToSlug, pageMetadata, twitterHandle, seo } = siteConfig;
  const pageId = extractPageId(pathname);
  const slug = pageToSlug[pageId] || '';

  const pageMeta = pageMetadata?.[pageId];
  const pageTitle = pageMeta?.title;
  const pageDescription = pageMeta?.description;
  const pageImage = pageMeta?.image;
  const pageAuthor = pageMeta?.author || seo?.defaultAuthor;

  // SEO settings with defaults
  const indexingEnabled = seo?.indexing !== false; // Default: true
  const brandReplacement = seo?.brandReplacement || siteName;
  const keywords = seo?.keywords;
  const aiAttribution = seo?.aiAttribution;

  const canonicalUrl = getCanonicalUrl(protocol, domain, slug, pageId, siteConfig);

  let result = responseData;

  // === SEO ===
  if (indexingEnabled) {
    result = result
      // Pattern 1: name before content
      .replace(/<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*(?:noindex|none)[^"']*["'][^>]*\/?>/gi, '')
      // Pattern 2: content before name
      .replace(/<meta[^>]*content=["'][^"']*(?:noindex|none)[^"']*["'][^>]*name=["']robots["'][^>]*\/?>/gi, '');

    // Remove existing canonical tags (we'll add our own)
    result = result.replace(/<link[^>]*rel=["']canonical["'][^>]*\/?>/gi, '');
  }

  // === BRANDING REPLACEMENT ===
  result = result.replace(/<title[^>]*>([^<]*)<\/title>/gi, (_match, content) => {
    return `<title>${replaceBranding(content, brandReplacement)}</title>`;
  });

  // Replace "Notion" in meta content attributes
  result = result.replace(
    /(<meta[^>]*(?:name|property)=["'](?:description|og:title|og:description|og:site_name|twitter:title|twitter:description)["'][^>]*content=["'])([^"']*)(["'])/gi,
    (_match, prefix, content, quote) => {
      return `${prefix}${replaceBranding(content, brandReplacement)}${quote}`;
    },
  );

  // handle reversed attribute order (content before name/property)
  result = result.replace(
    /(<meta[^>]*content=["'])([^"']*)(["'][^>]*(?:name|property)=["'](?:description|og:title|og:description|og:site_name|twitter:title|twitter:description)["'])/gi,
    (_match, prefix, content, suffix) => {
      return `${prefix}${replaceBranding(content, brandReplacement)}${suffix}`;
    },
  );

  // Catch-all: Replace "Notion" in any remaining meta tags not caught above
  result = result.replace(/(<meta[^>]*>)/gi, (match) => {
    return match.replace(/\bNotion\b/g, brandReplacement);
  });

  // === STANDARD META TAG REWRITES ===
  result = result
    // twitter:site - flexible pattern
    .replace(
      createMetaPattern('name', 'twitter:site'),
      twitterHandle ? `<meta name="twitter:site" content="${twitterHandle}"/>` : '',
    )
    // twitter:url - flexible pattern
    .replace(createMetaPattern('name', 'twitter:url'), `<meta name="twitter:url" content="${canonicalUrl}"/>`)
    // og:site_name - flexible pattern
    .replace(createMetaPattern('property', 'og:site_name'), `<meta property="og:site_name" content="${siteName}"/>`)
    // og:url - flexible pattern
    .replace(createMetaPattern('property', 'og:url'), `<meta property="og:url" content="${canonicalUrl}"/>`)
    // Remove apple-itunes-app (handles both name and property)
    .replace(/<meta[^>]*(?:name|property)=["']apple-itunes-app["'][^>]*\/?>/gi, '')
    // noscript refresh redirect
    .replace(
      /<noscript><meta[\s\S]*?http-equiv=["']refresh["'][\s\S]*?disabled-javascript\.html[\s\S]*?<\/noscript>/gi,
      `<noscript><meta http-equiv="refresh" content="0;url=${canonicalUrl.replace(/\/$/, '')}/disabled-javascript.html"/></noscript>`,
    );

  // === JSON-LD SCHEMA ===
  result = result.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, (match) => {
    try {
      const jsonMatch = match.match(/>(\s*\{[\s\S]*\})\s*</);
      if (jsonMatch) {
        let jsonStr = jsonMatch[1] ?? '';
        // Replace "Notion" branding in JSON-LD content
        jsonStr = replaceBranding(jsonStr, brandReplacement);
        const jsonData = JSON.parse(jsonStr);
        if (jsonData['@type'] === 'WebSite' || jsonData['@type'] === 'WebPage') {
          jsonData.name = siteName;
          jsonData.url = canonicalUrl;
          return `<script type="application/ld+json">${JSON.stringify(jsonData)}</script>`;
        }
      }
    } catch (e) {
      console.warn('Failed to parse JSON-LD:', e);
    }
    return match;
  });

  // If no JSON-LD exists, inject a comprehensive one
  if (!/<script\s+type=["']application\/ld\+json["']/i.test(result)) {
    const websiteSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': canonicalUrl,
      url: canonicalUrl,
      name: siteName,
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${protocol}//${seo?.canonicalDomain || domain}/#website`,
        name: siteName,
        url: `${protocol}//${seo?.canonicalDomain || domain}/`,
      },
      inLanguage: 'en-US',
      mainEntityOfPage: canonicalUrl,
    };

    if (pageAuthor) {
      websiteSchema.author = {
        '@type': 'Person',
        name: pageAuthor,
        url: `${protocol}//${seo?.canonicalDomain || domain}/`,
      };
    }

    result = result.replace(
      /(<head[^>]*>)/i,
      `$1\n<script type="application/ld+json">${JSON.stringify(websiteSchema)}</script>`,
    );
  }

  // === SEO TAGS INJECTION ===
  if (indexingEnabled) {
    const seoTags: string[] = [];

    // Canonical URL
    seoTags.push(`<link rel="canonical" href="${canonicalUrl}"/>`);

    // Robots meta
    seoTags.push(`<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large"/>`);

    // Keywords
    if (keywords) {
      seoTags.push(`<meta name="keywords" content="${escapeHtml(keywords)}"/>`);
    }

    // Author
    if (pageAuthor && !/<meta[^>]*name=["']author["']/i.test(result)) {
      seoTags.push(`<meta name="author" content="${escapeHtml(pageAuthor)}"/>`);
    }

    // AI crawler attribution meta tags
    if (aiAttribution) {
      seoTags.push(`<meta name="ai:source_url" content="${canonicalUrl}"/>`);
      seoTags.push(`<meta name="ai:source_attribution" content="${escapeHtml(aiAttribution)}"/>`);
    }

    // Inject SEO tags
    result = result.replace(/<\/head>/i, `${seoTags.join('\n')}\n</head>`);
  }

  // === PAGE-SPECIFIC METADATA OVERRIDES ===
  if (pageImage) {
    const safeImage = escapeHtml(pageImage);
    result = result
      .replace(createMetaPattern('property', 'og:image'), `<meta property="og:image" content="${safeImage}"/>`)
      .replace(createMetaPattern('name', 'twitter:image'), `<meta name="twitter:image" content="${safeImage}"/>`);
  }

  if (pageTitle) {
    const safeTitle = escapeHtml(pageTitle);
    result = result
      .replace(/<title[^>]*>[^<]*<\/title>/gi, `<title>${safeTitle}</title>`)
      .replace(createMetaPattern('name', 'twitter:title'), `<meta name="twitter:title" content="${safeTitle}"/>`)
      .replace(createMetaPattern('property', 'og:title'), `<meta property="og:title" content="${safeTitle}"/>`);
  }

  if (pageDescription) {
    const safeDesc = escapeHtml(pageDescription);
    result = result
      .replace(createMetaPattern('name', 'description'), `<meta name="description" content="${safeDesc}"/>`)
      .replace(
        createMetaPattern('name', 'twitter:description'),
        `<meta name="twitter:description" content="${safeDesc}"/>`,
      )
      .replace(
        createMetaPattern('property', 'og:description'),
        `<meta property="og:description" content="${safeDesc}"/>`,
      );
  }

  if (pageAuthor) {
    const safeAuthor = escapeHtml(pageAuthor);
    if (/<meta[^>]*name=["']article:author["']/i.test(result)) {
      result = result.replace(
        createMetaPattern('name', 'article:author'),
        `<meta name="article:author" content="${safeAuthor}"/>`,
      );
    } else {
      if (/<meta[^>]*property=["']og:locale["']/i.test(result)) {
        result = result.replace(
          /(<meta[^>]*property=["']og:locale["'][^>]*\/?>)/i,
          `$1\n<meta name="article:author" content="${safeAuthor}"/>`,
        );
      }
    }
  }

  return result;
}
