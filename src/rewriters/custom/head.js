function buildCustomHeader(customHeader, showBadge) {
  const badge = showBadge
    ? `<a class="nooxyBadge_4f7c2b1a-badge-link" style="cursor: pointer;" href="https://github.com/draphy/nooxy" tabindex="0" target="_blank" rel="noopener noreferrer">
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
  </a>`
    : '';
  return `
  <div class="nooxyBadge_4f7c2b1a-demo-topbar">
  ${customHeader ?? ''}
  ${badge}
</div>
  `;
}

const cusHeaderInterval = setInterval(() => {
  const header = document.querySelector('header');
  const injectedHeader = document.querySelector('.nooxyBadge_4f7c2b1a-demo-topbar');

  if (header && !injectedHeader) {
    header.insertAdjacentHTML('afterbegin', buildCustomHeader(customHeader, showBadge));
    clearInterval(cusHeaderInterval);
  }
}, 300);

function extractSlug(url) {
  if (url.startsWith('/')) {
    return url.split('?')[0];
  }
  try {
    const u = new URL(url);
    return u.pathname;
  } catch (_e) {
    return url.split('?')[0];
  }
}

function extractPageId(input) {
  const path = input.split('?')[0];
  const match = path.match(/([a-fA-F0-9]{32})(?=\/?$)/);
  return match ? match[1] : '';
}

window.nooxy = {
  _slugToPage: slugToPage,
  _pageToSlug: pageToSlug,
  _notionDomain: notionDomain,
  _myUrl: function (url) {
    const notionUrl = url.replace(location.origin, this._notionDomain);
    const slug = extractSlug(notionUrl);
    const pageId = slugToPage[slug];
    if (pageId) {
      const regex = new RegExp(`${slug}(?=\\?|$)`);
      return notionUrl.replace(regex, `/${pageId}`);
    }
    return notionUrl;
  },
  _yourUrl: function (url) {
    const cDomainUrl = url.replace(this._notionDomain, location.origin);
    const pageId = extractPageId(cDomainUrl);
    const slug = pageToSlug[pageId];
    if (slug) {
      return cDomainUrl.replace(new RegExp(`(^|[^/])\\/[^/].*${pageId}(?=\\?|$)`), `$1${slug}`);
    }
    return cDomainUrl;
  },
  href: function () {
    return this._myUrl(location.href);
  },
};

window.history.pushState = new Proxy(window.history.pushState, {
  apply: function (target, that, args) {
    const data = args[0];
    const unused = args[1];
    const url = args[2];
    return Reflect.apply(target, that, [data, unused, window.nooxy._yourUrl(url)]);
  },
});

window.history.replaceState = new Proxy(window.history.replaceState, {
  apply: function (target, that, args) {
    const data = args[0];
    const unused = args[1];
    const url = args[2];
    return Reflect.apply(target, that, [data, unused, window.nooxy._yourUrl(url)]);
  },
});
(function () {
  const replacedUrl = function (url) {
    const match = /^https?:\/\/([^\\/]*)/.exec(url);
    const domain = match ? match[1] : '';
    if (
      (domain.endsWith('notion.so') && !domain.endsWith('msgstore.www.notion.so')) ||
      domain.endsWith('splunkcloud.com') ||
      domain.endsWith('statsigapi.net')
    ) {
      // console.info('[NOOXY]', 'Suppress request:', url);
      return url.replace(/^.*:(.*)\/\//, '/200/$1');
    }
    return url;
  };

  window.fetch = new Proxy(window.fetch, {
    apply: function (target, that, args) {
      let url = args[0];
      const rest = Array.prototype.slice.call(args, 1);
      url = replacedUrl(url);
      // console.info('[NOOXY]', 'Fetch Request:', url);
      return Reflect.apply(target, that, [url].concat(rest));
    },
  });

  window.XMLHttpRequest = new Proxy(XMLHttpRequest, {
    construct: function (target, args) {
      const xhr = new (Function.prototype.bind.apply(target, [null].concat(args)))();
      xhr.open = new Proxy(xhr.open, {
        apply: function (target, that, args) {
          const method = args[0];
          let url = args[1];
          const rest = Array.prototype.slice.call(args, 2);
          url = replacedUrl(url);
          // console.info('[NOOXY]', 'XML Request:', url);
          return Reflect.apply(target, that, [method, url].concat(rest));
        },
      });
      return xhr;
    },
  });
})();
