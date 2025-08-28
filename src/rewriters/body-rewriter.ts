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
      window.CONFIG.domainBaseUrl = domainUrl;
      const SLUG_TO_PAGE = ${JSON.stringify(slugToPage)};
      const PAGE_TO_SLUG = ${JSON.stringify(pageToSlug)};
      const slugs = ${JSON.stringify(slugs)};
      const pages = ${JSON.stringify(pages)};
      const notionDomain = '${this.siteConfig.notionDomain ? this.siteConfig.notionDomain : 'www.notion.so'}';
      ${BODY_JS_STRING}
      </script>
      <script>

      function buildCustomHeader() {
  return \`
  <div class="nooxyBadge_4f7c2b1a-demo-topbar">

  ${customHeader}

  <a class="nooxyBadge_4f7c2b1a-badge-link" href="#" tabindex="0">
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

      function injectHeaderContentA3bZ4() {
        const header = document.querySelector('header');
        if (header) {
          header.innerHTML = buildCustomHeader();
          return true; // Indicate that injection was successful
        }
        return false; // Header not found yet
      }
      
      // Try immediately in case header is already present
      if (!injectHeaderContentA3bZ4()) {
        // If not present, observe for it
        const headerObserverA3bZ4 = new MutationObserver(() => {
          if (injectHeaderContentA3bZ4()) {
            headerObserverA3bZ4.disconnect(); // Stop observing once injected
          }
        });
        headerObserverA3bZ4.observe(document.body, { childList: true, subtree: true });
      }

        function rewriteDomA3bZ4() {
        const notionDomain = '${this.siteConfig.notionDomain ? this.siteConfig.notionDomain : 'www.notion.so'}';
    // --- Anchor href rewriting logic ---
    document.querySelectorAll('a[href]').forEach(anchor => {
      try {
        const url = new URL(anchor.href, '${this.protocol}//${domain}');
        if (url.hostname === notionDomain) {
          url.hostname = '${domain}';
          anchor.href = url.toString();
          anchor.setAttribute('data-href', anchor.href);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    });

    // --- Remove all Notion top bar ---
    const header = document.querySelector('header');
    if (header) {
      header.querySelectorAll('.notion-topbar-mobile').forEach(el => el.remove());
      header.querySelectorAll('.notion-topbar').forEach(el => el.remove());
    }
  
    // --- Remove all Notion tooltips on images ---
    document.querySelectorAll('div[style*="position: absolute; top: 4px;"]').forEach(el => {
      el.style.display = 'none';
    });
  
    // --- Remove hidden properties dropdown ---
    const propertiesDropdown = document.querySelector('div[aria-label="Page properties"]')?.nextElementSibling;
    if (propertiesDropdown) {
      propertiesDropdown.style.display = 'none';
    }
  }
  
  // --- MutationObserver to watch for DOM changes ---
  const domObserverA3bZ4 = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' || mutation.type === 'subtree') {
        rewriteDomA3bZ4();
        break;
      }
    }
  });
  
  domObserverA3bZ4.observe(document.body, { childList: true, subtree: true });
  
  rewriteDomA3bZ4();
  
  // --- Intercept anchor clicks to force navigation ---
  document.addEventListener('click', function(event) {
    const anchor = event.target.closest('a[href]');
    if (anchor && anchor.href.includes('${domain}')) {
      event.preventDefault();
      window.location.href = anchor.href;
    }
  });
      ${customBodyJS ?? ''}
      </script>
      `,
      {
        html: true,
      },
    )
  }
}
