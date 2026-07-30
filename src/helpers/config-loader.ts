import { NooxySiteConfig, NooxySiteConfigFull, NooxySiteConfigPageMetadata } from '../types';

// Notion page IDs reach the config in several shapes: the 32-char lowercase hex
// used in page URLs, the dashed UUID the Notion API returns, or whatever casing
// happened to be pasted in. Normalize to the canonical compact lowercase form so
// slugToPage, pageToSlug and pageMetadata all agree with the IDs extracted from
// request paths at runtime. Anything that is not a valid 32-char hex ID after
// normalizing is passed through untouched.
function normalizePageId(pageId: string): string {
  const compact = pageId.trim().replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(compact) ? compact : pageId;
}

export class ConfigManager {
  private static instances = new Map<string, ConfigManager>();
  private cachedProcessedConfig: NooxySiteConfigFull | null = null;
  private readonly config: NooxySiteConfig;

  private constructor(config: NooxySiteConfig) {
    this.config = config;
  }

  static getInstance(config: NooxySiteConfig, configKey = 'default'): ConfigManager {
    const existing = ConfigManager.instances.get(configKey);
    if (existing) {
      // The config argument is ignored once a key is cached. Two sites sharing a
      // key therefore both serve whichever config arrived first — silently, which
      // is how a multi-tenant deployment ended up serving one tenant's domain,
      // sitemap and canonical URLs for every tenant.
      if (existing.config !== config) {
        console.warn(
          `!! Two different configs were passed for configKey "${configKey}". The first one wins and this one is ignored. Give each site its own configKey.`,
        );
      }

      return existing;
    }

    const created = new ConfigManager(config);
    ConfigManager.instances.set(configKey, created);

    return created;
  }

  getConfig() {
    if (this.cachedProcessedConfig) {
      return this.cachedProcessedConfig;
    }
    this.cachedProcessedConfig = this.processConfig(this.config);
    return this.cachedProcessedConfig;
  }

  private processConfig(userConfig: NooxySiteConfig): NooxySiteConfigFull {
    const siteConfig: NooxySiteConfigFull = {
      ...userConfig,
      slugs: [],
      pageToSlug: {},
      // Copy rather than share the caller's object: adding the 404 entry below
      // would otherwise mutate the config the consumer passed in.
      slugToPage: { ...userConfig.slugToPage },
    };

    siteConfig.fof = {
      page: siteConfig.fof?.page?.length ? normalizePageId(siteConfig.fof.page) : siteConfig.fof?.page,
      slug: siteConfig.fof?.slug || '/404',
    };

    if (siteConfig.fof.page?.length) {
      siteConfig.slugToPage[siteConfig.fof.slug ?? '/404'] = siteConfig.fof.page;
    }

    // Normalize the configured page IDs before any index is built from them
    Object.keys(siteConfig.slugToPage).forEach((slug) => {
      // A slug is matched against a request pathname, which always begins with
      // "/", so one without it can never match. Nothing rejected it, and the
      // page simply 404'd with no indication why.
      if (!slug.startsWith('/')) {
        console.warn(
          `!! slugToPage key "${slug}" does not start with "/", so it can never match a request. Use "/${slug}".`,
        );
      }
      siteConfig.slugToPage[slug] = normalizePageId(siteConfig.slugToPage[slug] ?? '');
    });

    const configuredMetadata = siteConfig.pageMetadata ?? {};
    const normalizedMetadata: Record<string, NooxySiteConfigPageMetadata> = {};
    const metadataSource: Record<string, string> = {};
    Object.keys(configuredMetadata).forEach((pageId) => {
      const metadata = configuredMetadata[pageId];
      if (!metadata) {
        return;
      }
      const normalized = normalizePageId(pageId);
      // Notion gives the same page id as a dashed UUID in the API and as compact
      // hex in the URL bar, so entering one page twice in two formats is easy to
      // do by accident. Normalizing collapses them and the later entry wins,
      // which would otherwise silently discard a page's title and description.
      if (metadataSource[normalized]) {
        console.warn(
          `!! Duplicate pageMetadata for the same page: "${metadataSource[normalized]}" and "${pageId}" both normalize to ${normalized}. The later entry wins.`,
        );
      }
      metadataSource[normalized] = pageId;
      normalizedMetadata[normalized] = metadata;
    });
    siteConfig.pageMetadata = normalizedMetadata;

    // Build helper indexes
    const slugForPage: Record<string, string> = {};
    Object.keys(siteConfig.slugToPage).forEach((slug) => {
      const pageId = siteConfig.slugToPage[slug];
      if (pageId?.length) {
        siteConfig.slugs.push(slug);
        // Two slugs for one page is a reasonable thing to configure ("/" and
        // "/home"), but only one can be the reverse mapping, and that one decides
        // the canonical URL, what the address bar rewrites to, and which entry
        // meta-rewriter reads back. Picking the last silently made that look
        // arbitrary — and both slugs still appear in sitemap.xml.
        if (slugForPage[pageId]) {
          console.warn(
            `!! Two slugs map to the same page: "${slugForPage[pageId]}" and "${slug}" both point at ${pageId}. "${slug}" will be used as the canonical URL, and both appear in sitemap.xml.`,
          );
        }
        slugForPage[pageId] = slug;
        siteConfig.pageToSlug[pageId] = slug;
      }
    });

    return siteConfig;
  }

  static clearCache(configKey = 'default'): void {
    const instanceKey = configKey;
    const instance = ConfigManager.instances.get(instanceKey);
    if (instance) {
      instance.cachedProcessedConfig = null;
    }
  }
}
