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
  // Notion fires fire-and-forget telemetry and analytics to these hosts. Nooxy
  // previously bounced them off the proxy via a same-origin pseudo endpoint,
  // which produced a noisy 200 log line for every request. We now drop them
  // entirely in the browser so no network request is made and nothing reaches
  // the proxy. These responses were already discarded, so the page is unaffected.
  const pathOf = function (url) {
    const noScheme = url.replace(/^https?:\/\/[^\\/]*/, '');
    return noScheme.split('?')[0].split('#')[0];
  };

  const isSuppressedUrl = function (url) {
    // Same-origin Notion keepalive ping is non-essential and only adds proxy log noise.
    if (pathOf(url) === '/api/v3/ping') {
      return true;
    }
    const match = /^https?:\/\/([^\\/]*)/.exec(url);
    const domain = match ? match[1] : '';
    return (
      (domain.endsWith('notion.so') && !domain.endsWith('msgstore.www.notion.so')) ||
      domain.endsWith('splunkcloud.com') ||
      domain.endsWith('statsigapi.net')
    );
  };

  const urlOf = function (input) {
    if (typeof input === 'string') {
      return input;
    }
    // Request object
    if (input && typeof input.url === 'string') {
      return input.url;
    }
    try {
      return String(input);
    } catch (_e) {
      return '';
    }
  };

  window.fetch = new Proxy(window.fetch, {
    apply: function (target, that, args) {
      if (isSuppressedUrl(urlOf(args[0]))) {
        // Silently drop: resolve with a synthetic success, make no network call.
        // console.info('[NOOXY]', 'Dropped request:', urlOf(args[0]));
        return Promise.resolve(
          new Response('{}', {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Reflect.apply(target, that, args);
    },
  });

  window.XMLHttpRequest = new Proxy(XMLHttpRequest, {
    construct: function (target, args) {
      const xhr = new (Function.prototype.bind.apply(target, [null].concat(args)))();
      xhr.open = new Proxy(xhr.open, {
        apply: function (target, that, args) {
          const method = args[0];
          const url = args[1];
          const rest = Array.prototype.slice.call(args, 2);
          if (isSuppressedUrl(urlOf(url))) {
            // Resolve locally via a data: URL (allowed by connect-src 'data:') so
            // the request never leaves the browser and never hits the proxy.
            // console.info('[NOOXY]', 'Dropped request:', urlOf(url));
            return Reflect.apply(target, that, ['GET', 'data:application/json,%7B%7D'].concat(rest));
          }
          return Reflect.apply(target, that, [method, url].concat(rest));
        },
      });
      return xhr;
    },
  });
})();
