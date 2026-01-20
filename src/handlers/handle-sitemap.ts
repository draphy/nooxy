import { NooxySiteConfigFull } from '../types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function handleSitemap(siteConfig: NooxySiteConfigFull, protocol: string) {
  const { domain, slugs, seo } = siteConfig;
  const sitemapDomain = seo?.canonicalDomain || domain;
  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  slugs.forEach((slug) => {
    const mappedSlug = seo?.canonicalPathMap?.[slug] ?? slug;
    const safeSlug = escapeXml(mappedSlug);
    sitemap += `<url><loc>${protocol}//${sitemapDomain}${safeSlug}</loc></url>`;
  });
  sitemap += '</urlset>';

  const response = new Response(sitemap);

  response.headers.set('content-type', 'application/xml; charset=utf-8');

  return response;
}
