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
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    text-align: center;
    z-index: 2147483647;
    width: calc(100vw - 40px);
    max-width: 500px;
    box-sizing: border-box;
  "
>
  <!-- Title -->
  <h1
    style="
      font-size: 2.5rem;
      font-weight: 600;
      margin: 0 0 20px 0;
      letter-spacing: -0.02em;
    "
  >
    Connection Blocked
  </h1>

  <!-- Subtitle -->
  <p style="font-size: 1.1rem; line-height: 1.6; margin: 0 0 8px 0">
    Notion is trying to block
    <!-- Nooxy link -->
    <a
      href="https://github.com/draphy/nooxy"
      style="
        color: #60a5fa;
        text-decoration: none;
        font-size: 1.1rem;
        font-weight: 500;
        transition: color 0.2s ease;
      "
      onmouseover="this.style.color='#93c5fd'"
      onmouseout="this.style.color='#60a5fa'"
      onfocus="this.style.color='#93c5fd'"
      onblur="this.style.color='#60a5fa'"
    >
      nooxy
    </a>
  </p>

  <!-- Reload button -->
  <div style="margin-top: 40px">
    <a
      href="Javascript: window.location.reload()"
      style="
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        padding: 16px 32px;
        text-decoration: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
        transition: all 0.2s ease;
      "
      onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(59, 130, 246, 0.4)'"
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(59, 130, 246, 0.3)'"
      onfocus="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(59, 130, 246, 0.4)'"
      onblur="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(59, 130, 246, 0.3)'"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
      Try Again
    </a>
  </div>

  <!-- Footer info -->
  <div
    style="
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid rgba(128, 128, 128, 0.3);
    "
  >
    <p style="font-size: 0.9rem; margin: 0 0 8px 0; opacity: 0.7">
      Having trouble? Check your connection or try refreshing the page.
    </p>
    <!-- Made with Nooxy badge -->
    <a
      class="nooxyBadge_4f7c2b1a-badge-link"
      style="cursor: pointer; margin-top: 12px"
      href="https://github.com/draphy/nooxy"
      tabindex="0"
    >
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
