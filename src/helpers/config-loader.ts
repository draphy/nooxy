import { detectEnvironment } from '.'
import { NooxySiteConfig, NooxySiteConfigFull } from '../types'

export class ConfigManager {
  private static instances = new Map<string, ConfigManager>()
  private cachedConfig: NooxySiteConfigFull | null = null
  private initPromise: Promise<NooxySiteConfigFull> | null = null
  private readonly configPaths: string[]

  private constructor(customPath?: string) {
    if (customPath && customPath !== 'default') {
      this.configPaths = [customPath]
    } else {
      // Default: nooxy/config.js or nooxy/config.ts at root level
      this.configPaths = ['./nooxy/config.js', './nooxy/config.ts']
    }
  }

  static getInstance(configKey = 'default', customPath?: string): ConfigManager {
    const instanceKey = customPath ? `${configKey}:${customPath}` : configKey
    if (!ConfigManager.instances.has(instanceKey)) {
      ConfigManager.instances.set(instanceKey, new ConfigManager(customPath))
    }
    const instance = ConfigManager.instances.get(instanceKey)
    if (!instance) {
      throw new Error('Failed to get ConfigManager instance')
    }
    return instance
  }

  async getConfig(): Promise<NooxySiteConfigFull> {
    if (this.cachedConfig) {
      return this.cachedConfig
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.loadAndProcessConfig()
    this.cachedConfig = await this.initPromise
    return this.cachedConfig
  }

  private async loadAndProcessConfig(): Promise<NooxySiteConfigFull> {
    const rawConfig = await this.loadRawConfig()
    return this.processConfig(rawConfig)
  }

  private async loadRawConfig(): Promise<NooxySiteConfig> {
    const env = detectEnvironment()

    switch (env) {
      case 'cloudflare':
        return this.loadCloudflare()
      case 'deno':
        return this.loadDeno()
      case 'node':
        return this.loadNode()
      case 'browser':
        return this.loadBrowser()
      default:
        throw new Error(`Unsupported environment: ${env}`)
    }
  }

  private async loadCloudflare(): Promise<NooxySiteConfig> {
    for (const path of this.configPaths) {
      try {
        const module = await import(path)
        return module.default || module.SITE_CONFIG || module
      } catch (_error) {
        // Continue to next path if import fails
      }
    }
    throw new Error('Config file not found')
  }

  private async loadDeno(): Promise<NooxySiteConfig> {
    // Type guard to ensure it's a Deno environment
    if (typeof globalThis === 'undefined' || !('Deno' in globalThis)) {
      throw new Error('Deno environment not detected')
    }

    try {
      // @ts-ignore - Deno-specific import, will only execute in Deno environment
      const { resolve } = await import('https://deno.land/std/path/mod.ts')

      for (const relativePath of this.configPaths) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
          const fullPath = resolve((globalThis as any).Deno.cwd(), relativePath)
          const module = await import(`file://${fullPath}`)
          return module.default || module.SITE_CONFIG || module
        } catch (_error) {
          // Continue to next path if import fails
        }
      }
    } catch (_error) {
      throw new Error('Deno path module not available')
    }
    throw new Error('Config file not found')
  }

  private async loadNode(): Promise<NooxySiteConfig> {
    const { resolve } = await import('path')
    const { pathToFileURL } = await import('url')

    for (const relativePath of this.configPaths) {
      try {
        const fullPath = resolve(process.cwd(), relativePath)
        const fileUrl = pathToFileURL(fullPath).href
        const module = await import(fileUrl)
        return module.default || module.SITE_CONFIG || module
      } catch (_error) {
        // Continue to next path if import fails
      }
    }
    throw new Error('Config file not found')
  }

  private async loadBrowser(): Promise<NooxySiteConfig> {
    for (const path of this.configPaths) {
      try {
        // Convert relative paths to absolute for browser
        const absolutePath = path.startsWith('./') ? path.slice(2) : path
        const response = await fetch(`/${absolutePath}`)
        if (response.ok) {
          const text = await response.text()
          const script = new Function(
            'exports',
            'module',
            `${text}; return module.exports || exports.default || exports;`,
          )
          const exports = {}
          const module = { exports }
          return script(exports, module)
        }
      } catch (_error) {
        // Continue to next path if import fails
      }
    }
    throw new Error('Config file not found')
  }

  private processConfig(userConfig: NooxySiteConfig): NooxySiteConfigFull {
    const siteConfig: NooxySiteConfigFull = {
      ...userConfig,
      slugs: [],
      pages: [],
      pageToSlug: {},
    }

    siteConfig.pageMetadata = siteConfig.pageMetadata || {}

    siteConfig.fof = {
      page: siteConfig.fof?.page,
      slug: siteConfig.fof?.slug || '404',
    }

    if (siteConfig.fof.page?.length) {
      siteConfig.slugToPage[siteConfig.fof.slug ?? ''] = siteConfig.fof.page
    }

    // Build helper indexes
    Object.keys(siteConfig.slugToPage).forEach((slug) => {
      const pageId = siteConfig.slugToPage[slug]
      if (pageId?.length) {
        siteConfig.slugs.push(slug)
        siteConfig.pages.push(pageId)
        siteConfig.pageToSlug[pageId] = slug
      }
    })

    return siteConfig
  }

  static clearCache(options?: string | { configKey?: string; configPath?: string }): void {
    let configKey = 'default'
    let configPath: string | undefined

    if (typeof options === 'string') {
      configPath = options
    } else if (options) {
      configKey = options.configKey || 'default'
      configPath = options.configPath
    }

    const instanceKey = configPath ? `${configKey}:${configPath}` : configKey
    const instance = ConfigManager.instances.get(instanceKey)
    if (instance) {
      instance.cachedConfig = null
      instance.initPromise = null
    }
  }
}
