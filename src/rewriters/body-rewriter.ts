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
    const { domain, slugToPage, pageToSlug, slugs, pages, customBodyJS, customHeader } = this.siteConfig

    element.append(
      `
      <script>
      const domain = '${domain}';
      const domainUrl = '${this.protocol}//${domain}';
      if (window.CONFIG?.domainBaseUrl) window.CONFIG.domainBaseUrl = domainUrl;
      const SLUG_TO_PAGE = ${JSON.stringify(slugToPage)};
      const PAGE_TO_SLUG = ${JSON.stringify(pageToSlug)};
      const slugs = ${JSON.stringify(slugs)};
      const pages = ${JSON.stringify(pages)};
      const notionDomain = '${this.siteConfig.notionDomain ? this.siteConfig.notionDomain : 'www.notion.so'}';

      function buildCustomHeader() {
  return \`
  <div class="nooxyBadge_4f7c2b1a-demo-topbar">

  ${customHeader ?? ''}

  <a class="nooxyBadge_4f7c2b1a-badge-link" style="cursor: pointer;" href="https://github.com/draphy/nooxy" tabindex="0">
    <!-- Subtle shine effect -->
    <span class="nooxyBadge_4f7c2b1a-badge-shine"></span>
    <!-- Sparkle icon -->
    <svg
      class="nooxyBadge_4f7c2b1a-badge-icon"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        d="M12 0l3.09 6.26L22 9.27l-6.91 3.01L12 24l-3.09-11.72L2 9.27l6.91-3.01L12 0z"
      />
    </svg>
    Made with Nooxy
  </a>
</div>
  \`;
}

function buildErrorPage() {
  return \`
      <div
        class="nooxy_4f7c2b1a-error-page"
        style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
          text-align: center;
        "
      >
        <h1 style="color: #e74c3c; margin-bottom: 20px; font-size: 3em">
          Oops!
        </h1>
<p style="color: #666; margin-bottom: 10px; font-size: 1.2em">
          Notion is trying to block
          <a
            href="https://github.com/draphy/nooxy"
            style="color: #3498db; text-decoration: none; cursor: pointer;"
            >nooxy</a
          >.
        </p>
        <p style="color: #666; margin-bottom: 30px; font-size: 1em">
          No worries
        </p>
        <a
          href="Javascript: window.location.reload()"
          style="
            display: inline-block;
            background-color: #3498db;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
          "
          >Reload</a
        >
      </div>
  \`;
}

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
