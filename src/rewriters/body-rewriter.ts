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

      const headerbD9Xa = document.querySelector('header');
      headerbD9Xa.innerHTML = 'Made with nooxy ${customHeader}'

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
