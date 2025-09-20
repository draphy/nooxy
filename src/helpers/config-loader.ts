import { NooxySiteConfig, NooxySiteConfigFull } from '../types';

export class ConfigManager {
  private static instances = new Map<string, ConfigManager>();
  private cachedProcessedConfig: NooxySiteConfigFull | null = null;
  private readonly config: NooxySiteConfig;

  private constructor(config: NooxySiteConfig) {
    this.config = config;
  }

  static getInstance(config: NooxySiteConfig, configKey = 'default'): ConfigManager {
    const instanceKey = configKey;
    if (!ConfigManager.instances.has(instanceKey)) {
      ConfigManager.instances.set(instanceKey, new ConfigManager(config));
    }
    const instance = ConfigManager.instances.get(instanceKey);
    if (!instance) {
      throw new Error('Failed to get ConfigManager instance');
    }
    return instance;
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
    };

    siteConfig.pageMetadata = siteConfig.pageMetadata || {};

    siteConfig.fof = {
      page: siteConfig.fof?.page,
      slug: siteConfig.fof?.slug || '404',
    };

    if (siteConfig.fof.page?.length) {
      siteConfig.slugToPage[siteConfig.fof.slug ?? ''] = siteConfig.fof.page;
    }

    // Build helper indexes
    Object.keys(siteConfig.slugToPage).forEach((slug) => {
      const pageId = siteConfig.slugToPage[slug];
      if (pageId?.length) {
        siteConfig.slugs.push(slug);
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
