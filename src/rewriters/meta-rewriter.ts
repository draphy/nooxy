import { extractPageId, removeNotionAds } from '../helpers';
import { NooxySiteConfigFull } from '../types';

// Rewrite meta tags and page metadata
export function rewriteMetaTags(
  responseData: string,
  pathname: string,
  siteConfig: NooxySiteConfigFull,
  protocol: string,
): string {
  const { siteName, siteDescription, siteImage, domain, pageToSlug, pageMetadata } = siteConfig;
  const pageId = extractPageId(pathname);
  const isRootPage = pageToSlug[pageId] === '/';
  let data = responseData;

  // Get page-specific metadata
  const pageTitle = pageMetadata?.[pageId]?.title;
  const pageDescription = pageMetadata?.[pageId]?.description;
  const pageImage = pageMetadata?.[pageId]?.image;
  const pageAuthor = pageMetadata?.[pageId]?.author;

  // Rewrite <title> tag
  data = data.replace(/<title>([^<]*)<\/title>/gi, (_match, content) => {
    const newTitle = pageTitle ?? removeNotionAds(content);
    return `<title>${newTitle}</title>`;
  });

  // Rewrite meta tags - improved regex to handle self-closing tags and various formats
  data = data.replace(/<meta\s+([^>]*?)(?:\s*\/)?>/gi, (match, attributes) => {
    // Parse attributes with improved regex to handle various quote styles and spacing
    const attrMap: Record<string, string> = {};
    // Handle both single and double quotes, with proper escaping
    attributes.replace(/(\w+)=(['"])([^'"]*?)\2/g, (match: string, key: string, _quote: string, value: string) => {
      attrMap[key] = value;
      return match;
    });

    const property = attrMap.property || '';
    const name = attrMap.name || '';
    const content = attrMap.content || '';

    // Handle og:title and twitter:title
    if (property === 'og:title' || name === 'twitter:title') {
      const newTitle = pageTitle ?? removeNotionAds(content);
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${newTitle}$1`);
    }

    // Handle og:site_name
    if (property === 'og:site_name') {
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${siteName}$1`);
    }

    // Handle article:author
    if (name === 'article:author') {
      const newAuthor = pageAuthor ?? content;
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${newAuthor}$1`);
    }

    // Handle descriptions
    if (name === 'description' || property === 'og:description' || name === 'twitter:description') {
      let newDescription: string;
      if (isRootPage) {
        newDescription = siteDescription;
      } else {
        newDescription = pageDescription ?? removeNotionAds(content);
      }
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${newDescription}$1`);
    }

    // Handle URLs
    if (property === 'og:url' || name === 'twitter:url') {
      let newUrl: string;
      if (isRootPage) {
        newUrl = `${protocol}//${domain}/`;
      } else if (pageToSlug[pageId]) {
        newUrl = `${protocol}//${domain}${pageToSlug[pageId]}`;
      } else {
        newUrl = `${protocol}//${domain}/${pageId}`;
      }
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${newUrl}$1`);
    }

    // Handle images
    if (property === 'og:image' || name === 'twitter:image') {
      let newImage: string;
      if (isRootPage && siteImage) {
        newImage = siteImage;
      } else {
        newImage = pageImage ?? content;
      }
      return match.replace(/content=(['"])([^'"]*?)\1/, `content=$1${newImage}$1`);
    }

    // Remove apple-itunes-app meta tag
    if (name === 'apple-itunes-app') {
      return '';
    }

    return match;
  });

  // Rewrite JSON-LD schema - no changes needed, this looks correct
  data = data.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, (match) => {
    try {
      const jsonMatch = match.match(/>(\s*\{[\s\S]*?\})\s*</);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[1] ?? '');
        if (jsonData['@type'] === 'WebSite') {
          jsonData.name = siteName;
          if (isRootPage) {
            jsonData.url = `${protocol}//${domain}/`;
          } else if (pageToSlug[pageId]) {
            jsonData.url = `${protocol}//${domain}${pageToSlug[pageId]}`;
          } else {
            jsonData.url = `${protocol}//${domain}/${pageId}`;
          }
          return `<script type="application/ld+json">${JSON.stringify(jsonData)}</script>`;
        }
      }
    } catch (e) {
      // If JSON parsing fails, return original match
      console.warn('Failed to parse JSON-LD:', e);
    }
    return match;
  });

  // Rewrite noscript meta refresh URL - improved regex to handle spacing variations
  data = data.replace(
    /<noscript><meta\s+http-equiv=(['"])refresh\1\s+content=(['"])0;url=https:\/\/www\.notion\.so\/disabled-javascript\.html\2\s*\/?><\/noscript>/gi,
    `<noscript><meta http-equiv="refresh" content="0;url=${protocol}//${domain}/disabled-javascript.html"/></noscript>`,
  );

  return data;
}
