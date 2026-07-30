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

// Replacer function, not a replacement string: '$&' and friends in a configured
// brand name would otherwise be expanded as substitution patterns.
function replaceBranding(text: string, replacement: string): string {
  return text.replace(/\bNotion\b/g, () => replacement);
}

// JSON.stringify does not escape '<', so a "</script>" inside any config value
// would close the ld+json block and turn the rest into live markup.
function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Applies the brand replacement to every string in a parsed JSON-LD value.
 *
 * Operating on the parsed structure rather than the raw text means a brand
 * containing a quote or a backslash cannot change the shape of the document —
 * it is only ever substituted into a string.
 */
function rebrandJsonValues(value: unknown, replacement: string): unknown {
  if (typeof value === 'string') {
    return replaceBranding(value, replacement);
  }
  if (Array.isArray(value)) {
    return value.map((item) => rebrandJsonValues(item, replacement));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        rebrandJsonValues(item, replacement),
      ]),
    );
  }

  return value;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Matches attributes up to the end of the tag: either an ordinary character, or a
// complete quoted value. The three alternatives cannot match the same character,
// so there is no ambiguity for the engine to backtrack over.
//
// `[^>]*` was the previous form, and it cannot cross a '>' inside an attribute
// value. So `<meta content="a > b" name="description"/>` was missed, and
// upsertMetaTag then inserted a *second* description tag instead of replacing the
// one already there.
const META_ATTRIBUTES = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;

// Helper to create flexible meta tag pattern that handles:
// - Single or double quotes
// - Any attribute order
// - Extra whitespace (but NOT newlines - prevents cross-tag matching)
// - Self-closing or not
// - A '>' inside a quoted attribute value
function createMetaPattern(nameOrProperty: 'name' | 'property', value: string): RegExp {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<meta${META_ATTRIBUTES}${nameOrProperty}=["']${escapedValue}["']${META_ATTRIBUTES}\\/?>`, 'gi');
}

/**
 * Replaces a meta tag, or adds it when the upstream page has none.
 *
 * Configured page metadata used to be applied with a plain replace, so a value
 * was silently dropped whenever Notion happened not to emit that tag - og:image
 * in particular is not always present.
 */
function upsertMetaTag(html: string, kind: 'name' | 'property', key: string, tag: string): string {
  const pattern = createMetaPattern(kind, key);
  if (pattern.test(html)) {
    // `pattern` is global, and .test() advanced lastIndex.
    pattern.lastIndex = 0;
    return html.replace(pattern, () => tag);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, () => `${tag}</head>`);
  }
  // An opening <head> with no closing one still gives somewhere valid to put it.
  const opening = /<head[^>]*>/i;
  if (opening.test(html)) {
    return html.replace(opening, (match) => `${match}${tag}`);
  }
  // Nowhere valid to insert. This used to fall back to `html + tag`, which put
  // the tag after </html> where a browser ignores it — and, for a body that was
  // not really HTML, appended markup that corrupted it. Leaving the document
  // alone is the only safe answer.
  return html;
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

  // Config values are interpolated into markup, so they are escaped at the point
  // of use. This matters for multi-tenant deployments, where the config for one
  // site is not necessarily authored by whoever operates the worker.
  const safeBrand = escapeHtml(brandReplacement);
  const safeSiteName = escapeHtml(siteName);
  const safeTwitterHandle = twitterHandle ? escapeHtml(twitterHandle) : '';

  const canonicalUrl = getCanonicalUrl(protocol, domain, slug, pageId, siteConfig);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);

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
    return `<title>${replaceBranding(content, safeBrand)}</title>`;
  });

  // Replace "Notion" in meta content attributes
  result = result.replace(
    /(<meta[^>]*(?:name|property)=["'](?:description|og:title|og:description|og:site_name|twitter:title|twitter:description)["'][^>]*content=["'])([^"']*)(["'])/gi,
    (_match, prefix, content, quote) => {
      return `${prefix}${replaceBranding(content, safeBrand)}${quote}`;
    },
  );

  // handle reversed attribute order (content before name/property)
  result = result.replace(
    /(<meta[^>]*content=["'])([^"']*)(["'][^>]*(?:name|property)=["'](?:description|og:title|og:description|og:site_name|twitter:title|twitter:description)["'])/gi,
    (_match, prefix, content, suffix) => {
      return `${prefix}${replaceBranding(content, safeBrand)}${suffix}`;
    },
  );

  // Catch-all: Replace "Notion" in any remaining meta tags not caught above
  result = result.replace(/(<meta[^>]*>)/gi, (match) => {
    return match.replace(/\bNotion\b/g, () => safeBrand);
  });

  // === STANDARD META TAG REWRITES ===
  // Every replacement carrying a config value uses a replacer function: config
  // strings are user-authored and may contain '$&', '$`', "$'" or '$n', which
  // String.replace would otherwise expand as substitution patterns.
  result = result
    // twitter:site - flexible pattern
    .replace(createMetaPattern('name', 'twitter:site'), () =>
      twitterHandle ? `<meta name="twitter:site" content="${safeTwitterHandle}"/>` : '',
    )
    // twitter:url - flexible pattern
    .replace(createMetaPattern('name', 'twitter:url'), () => `<meta name="twitter:url" content="${safeCanonicalUrl}"/>`)
    // og:site_name - flexible pattern
    .replace(
      createMetaPattern('property', 'og:site_name'),
      () => `<meta property="og:site_name" content="${safeSiteName}"/>`,
    )
    // og:url - flexible pattern
    .replace(createMetaPattern('property', 'og:url'), () => `<meta property="og:url" content="${safeCanonicalUrl}"/>`)
    // Remove apple-itunes-app (handles both name and property)
    .replace(/<meta[^>]*(?:name|property)=["']apple-itunes-app["'][^>]*\/?>/gi, '')
    // noscript refresh redirect
    .replace(
      /<noscript><meta[\s\S]*?http-equiv=["']refresh["'][\s\S]*?disabled-javascript\.html[\s\S]*?<\/noscript>/gi,
      () =>
        `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl.replace(/\/$/, ''))}/disabled-javascript.html"/></noscript>`,
    );

  // === JSON-LD SCHEMA ===
  result = result.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, (match) => {
    try {
      const jsonMatch = match.match(/>(\s*\{[\s\S]*\})\s*</);
      if (jsonMatch) {
        // Parse first, then rebrand the string values.
        //
        // Branding used to be applied to the raw JSON text before parsing, so a
        // brandReplacement containing a double quote produced invalid JSON: the
        // parse threw, the catch swallowed it, and the block was emitted with
        // "Notion" still in it. Walking the parsed value cannot break the
        // structure whatever the brand contains.
        const jsonData = rebrandJsonValues(JSON.parse(jsonMatch[1] ?? ''), brandReplacement) as Record<string, unknown>;
        if (jsonData['@type'] === 'WebSite' || jsonData['@type'] === 'WebPage') {
          // Not escaped: this lands inside a script element, where HTML escaping
          // would emit a literal &amp;. serializeJsonLd handles the one character
          // that matters there.
          jsonData.name = siteName;
          jsonData.url = canonicalUrl;

          return `<script type="application/ld+json">${serializeJsonLd(jsonData)}</script>`;
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
      (_match, headTag) => `${headTag}\n<script type="application/ld+json">${serializeJsonLd(websiteSchema)}</script>`,
    );
  }

  // === SEO TAGS INJECTION ===
  if (indexingEnabled) {
    const seoTags: string[] = [];

    // Canonical URL
    seoTags.push(`<link rel="canonical" href="${safeCanonicalUrl}"/>`);

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
      seoTags.push(`<meta name="ai:source_url" content="${safeCanonicalUrl}"/>`);
      seoTags.push(`<meta name="ai:source_attribution" content="${escapeHtml(aiAttribution)}"/>`);
    }

    // Inject SEO tags
    result = result.replace(/<\/head>/i, () => `${seoTags.join('\n')}\n</head>`);
  }

  // === PAGE-SPECIFIC METADATA OVERRIDES ===
  if (pageImage) {
    const safeImage = escapeHtml(pageImage);
    result = upsertMetaTag(result, 'property', 'og:image', `<meta property="og:image" content="${safeImage}"/>`);
    result = upsertMetaTag(result, 'name', 'twitter:image', `<meta name="twitter:image" content="${safeImage}"/>`);
  }

  if (pageTitle) {
    const safeTitle = escapeHtml(pageTitle);
    result = result.replace(/<title[^>]*>[^<]*<\/title>/gi, () => `<title>${safeTitle}</title>`);
    result = upsertMetaTag(result, 'name', 'twitter:title', `<meta name="twitter:title" content="${safeTitle}"/>`);
    result = upsertMetaTag(result, 'property', 'og:title', `<meta property="og:title" content="${safeTitle}"/>`);
  }

  if (pageDescription) {
    const safeDesc = escapeHtml(pageDescription);
    result = upsertMetaTag(result, 'name', 'description', `<meta name="description" content="${safeDesc}"/>`);
    result = upsertMetaTag(
      result,
      'name',
      'twitter:description',
      `<meta name="twitter:description" content="${safeDesc}"/>`,
    );
    result = upsertMetaTag(
      result,
      'property',
      'og:description',
      `<meta property="og:description" content="${safeDesc}"/>`,
    );
  }

  if (pageAuthor) {
    const safeAuthor = escapeHtml(pageAuthor);
    // upsertMetaTag, like every other page-metadata field above.
    //
    // This was the one field left on the older pattern: replace if Notion emitted
    // article:author, else insert after og:locale, else do nothing at all. So a
    // configured author was silently dropped whenever the upstream page had
    // neither tag — and with seo.indexing disabled the name="author" tag added
    // further up is absent too, losing it entirely.
    result = upsertMetaTag(result, 'name', 'article:author', `<meta name="article:author" content="${safeAuthor}"/>`);
  }

  return result;
}
