import { NooxySiteConfigFull } from '../types'
import { BODY_JS_STRING } from './_body-js-string'

export class BodyRewriter {
  siteConfig: NooxySiteConfigFull
  protocol: string

  constructor(siteConfig: NooxySiteConfigFull, protocol: string) {
    this.siteConfig = siteConfig
    this.protocol = protocol
  }

  element(element: Element) {
    const { domain, slugToPage, pageToSlug, slugs, pages, customBodyJS } = this.siteConfig

    element.append(
      `
      <script>
      const domain = '${domain}';
      const domainUrl = '${this.protocol}//${domain}';
      window.CONFIG.domainBaseUrl = domainUrl;
      const SLUG_TO_PAGE = ${JSON.stringify(slugToPage)};
      const PAGE_TO_SLUG = ${JSON.stringify(pageToSlug)};
      const slugs = ${JSON.stringify(slugs)};
      const pages = ${JSON.stringify(pages)};
      const notionDomain = '${this.siteConfig.notionDomain ? this.siteConfig.notionDomain : 'www.notion.so'}';
      ${BODY_JS_STRING}
      </script>
      <script>
      ${customBodyJS ?? ''}
      </script>
      `,
      {
        html: true,
      },
    )
  }
}
