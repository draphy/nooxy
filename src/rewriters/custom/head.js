function buildCustomHeader(customHeader, showBadge) {
  const badge = showBadge
    ? `<a class="nooxyBadge_4f7c2b1a-badge-link" style="cursor: pointer;" href="https://github.com/draphy/nooxy" tabindex="0" target="_blank" rel="noopener noreferrer"><span class="nooxyBadge_4f7c2b1a-badge-shine"></span><svg class="nooxyBadge_4f7c2b1a-badge-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l3.09 6.26L22 9.27l-6.91 3.01L12 24l-3.09-11.72L2 9.27l6.91-3.01L12 0z"/></svg>Made with Nooxy</a>`
    : '';
  return `<div class="nooxyBadge_4f7c2b1a-demo-topbar">${customHeader ?? ''}${badge}</div>`;
}

// Inject badge inside header and re-inject if React removes it
// Uses MutationObserver + requestAnimationFrame to batch checks (max 60/sec, not per-mutation)
(function initBadge() {
  const BADGE_CLASS = 'nooxyBadge_4f7c2b1a-demo-topbar';
  let pending = false;

  const injectBadge = () => {
    const header = document.querySelector('header');
    if (header && !header.querySelector(`.${BADGE_CLASS}`)) {
      header.insertAdjacentHTML('afterbegin', buildCustomHeader(customHeader, showBadge));
    }
  };

  const scheduleInject = () => {
    if (pending) {
      return;
    }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      injectBadge();
    });
  };

  const init = () => {
    injectBadge();
    new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
  };

  document.body ? init() : document.addEventListener('DOMContentLoaded', init);
})();

// Deliberately NOT identical to extractSlug in src/helpers/index.ts, for the same
// reason as extractPageId below: this copy also strips '#hash', because it runs in
// the browser where location.href carries a fragment. The server never receives
// one. Do not "align" them.
function extractSlug(url) {
  if (url.startsWith('/')) {
    return url.split('?')[0].split('#')[0];
  }
  try {
    const u = new URL(url);
    return u.pathname;
  } catch (_e) {
    return url.split('?')[0].split('#')[0];
  }
}

// pageToSlug keys are normalized to lowercase by ConfigManager, so lowercase
// here too.
//
// Deliberately NOT identical to extractPageId in src/helpers/index.ts: this one
// also strips '#hash', because it runs in the browser where location.href carries
// a fragment. The server never receives one, so the helper has no reason to. Do
// not "align" them.
function extractPageId(input) {
  const path = input.split('?')[0].split('#')[0];
  const match = path.match(/([a-fA-F0-9]{32})(?=\/?$)/);
  return match ? match[1].toLowerCase() : '';
}

// Slugs are user-authored config values and may contain regex metacharacters
// (e.g. '/v1.0', '/c++'). Mirrors escapeRegExp in src/helpers/index.ts.
//
// Written with a replacer function rather than the '$&' token. That is belt and
// braces today: the injection site in data-rewriter.ts already passes a replacer
// function, so a literal '$&' in this file's text is safe. Keeping this file free
// of '$&' means it stays safe if that injection ever goes back to a replacement
// string.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`);
}

// Split off the '?query' / '#hash' tail.
function splitUrlTail(url) {
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  let cut;
  if (q === -1) {
    cut = h;
  } else if (h === -1) {
    cut = q;
  } else {
    cut = q < h ? q : h;
  }
  return cut === -1 ? [url, ''] : [url.slice(0, cut), url.slice(cut)];
}

// 'https://host/a/b' -> 'https://host'; '//host/a' -> '//host'; '/a/b' -> ''
function originOf(url) {
  let start = -1;
  if (url.startsWith('//')) {
    start = 2;
  } else {
    const scheme = url.indexOf('://');
    if (scheme !== -1) {
      start = scheme + 3;
    }
  }
  if (start === -1) {
    return '';
  }
  const slash = url.indexOf('/', start);
  return slash === -1 ? url : url.slice(0, slash);
}

window.nooxy = {
  _slugToPage: slugToPage,
  _pageToSlug: pageToSlug,
  _notionDomain: notionDomain,
  _myUrl: function (url) {
    if (typeof url !== 'string') {
      return url;
    }
    const notionUrl = url.replace(location.origin, this._notionDomain);
    const slug = extractSlug(notionUrl);
    const pageId = slugToPage[slug];
    if (pageId) {
      const regex = new RegExp(`${escapeRegExp(slug)}(?=\\?|#|$)`);
      return notionUrl.replace(regex, `/${pageId}`);
    }
    return notionUrl;
  },
  _yourUrl: function (url) {
    // history.pushState/replaceState may be called with the url argument
    // omitted, in which case there is nothing to translate.
    if (typeof url !== 'string') {
      return url;
    }
    const cDomainUrl = url.replace(this._notionDomain, location.origin);
    const pageId = extractPageId(cDomainUrl);
    const slug = pageToSlug[pageId];
    if (!slug) {
      return cDomainUrl;
    }
    // Notion writes '/<pageId>' while booting and '/<Title>-<pageId>' once the
    // page record loads. Replace the whole path with the configured slug so
    // both shapes resolve, keeping origin, query and hash intact.
    const parts = splitUrlTail(cDomainUrl);
    return originOf(parts[0]) + slug + parts[1];
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
    const noScheme = url.replace(/^https?:\/\/[^/]*/, '');
    return noScheme.split('?')[0].split('#')[0];
  };

  const isSuppressedUrl = function (url) {
    // Same-origin Notion keepalive ping is non-essential and only adds proxy log noise.
    if (pathOf(url) === '/api/v3/ping') {
      return true;
    }
    const match = /^https?:\/\/(?:[^@/:]*:[^@/]*@)?([^/:]*)/i.exec(url);
    const domain = match ? match[1].toLowerCase() : '';
    // file.notion.so and file.notion.com serve signed PDF and attachment downloads.
    // They are real content, not telemetry, so they must not be dropped.
    if (domain === 'file.notion.so' || domain === 'file.notion.com') {
      return false;
    }
    // Check exact domain or subdomain (e.g., notion.so or api.notion.so, not notnotion.so)
    const isNotion = domain === 'notion.so' || domain.endsWith('.notion.so');
    const isMsgStore = domain === 'msgstore.www.notion.so';
    const isSplunk = domain === 'splunkcloud.com' || domain.endsWith('.splunkcloud.com');
    const isStatsig = domain === 'statsigapi.net' || domain.endsWith('.statsigapi.net');
    return (isNotion && !isMsgStore) || isSplunk || isStatsig;
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
