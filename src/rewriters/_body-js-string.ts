export const BODY_JS_STRING = `
localStorage.__console = true

let redirected = false;
const domainUrlObj = new URL(domainUrl)
let navigationInProgress = false; // Add flag to prevent race conditions

function getPage() {
  return location.pathname.slice(-32)
}

function getSlug() {
  return location.pathname.slice(1)
}

function updateSlug() {
  const slug = PAGE_TO_SLUG[getPage()]

  if (slug) {
    history.replaceState(history.state, '', ['/', slug].join(''))
  }
}

// Add debouncing for DOM rewriting
let rewriteTimeout;
function debouncedRewriteDom() {
  clearTimeout(rewriteTimeout);
  rewriteTimeout = setTimeout(rewriteDomA3bZ4, 100); // 100ms debounce
}

const observer = new MutationObserver(() => {
  debouncedRewriteDom(); // Use debounced version
  
  // --- Remove all Notion top bar ---
  const header = document.querySelector('header');
  const injectedHeader = document.querySelector('.nooxyBadge_4f7c2b1a-demo-topbar')
  if (header) {
    header.querySelectorAll('.notion-topbar-mobile').forEach(el =>{el.style.display = 'none';});
    header.querySelectorAll('.notion-topbar').forEach(el => {el.style.display = 'none';});
    if(injectedHeader) {
      injectedHeader.style.setProperty("display", "block", "important");
    }else {
      header.insertAdjacentHTML("afterbegin", buildCustomHeader());
    }
  }

  if (redirected) return

  const nav = document.querySelector('.notion-topbar')
  const mobileNav = document.querySelector('.notion-topbar-mobile')

  if ((nav && nav.firstChild && nav.firstChild.firstChild) || (mobileNav && mobileNav.firstChild)) {
    updateSlug()
    redirected = true

    const { onpopstate } = window

    window.onpopstate = function () {
      if (navigationInProgress) return; // Prevent race conditions
      
      navigationInProgress = true;
      
      if (slugs.includes(getSlug())) {
        const page = SLUG_TO_PAGE[getSlug()]

        if (page) {
          history.replaceState(history.state, 'bypass', ['/', page].join(''))
        }
      }

      onpopstate.apply(this, [].slice.call(arguments))
      updateSlug()
      
      setTimeout(() => {
        navigationInProgress = false;
      }, 300); // Reset flag after navigation settles
    }
  }
})

observer.observe(document.querySelector('#notion-app'), {
  childList: true,
  subtree: true,
})

const { replaceState, back, forward } = window.history

window.history.back = function () {
  if (navigationInProgress) return;
  back.apply(window.history, arguments)
}

window.history.forward = function () {
  if (navigationInProgress) return;
  forward.apply(window.history, arguments)
}

window.history.replaceState = function () {
  if (arguments[1] === 'bypass') {
    return
  }

  if (navigationInProgress) return; // Prevent race conditions

  const slug = getSlug()
  const isKnownSlug = slugs.includes(slug)
  const url = arguments[2];
  if (url && url.startsWith('http')) {
    const parsed = new URL(url);
    if(parsed.hostname !== domain){
    parsed.hostname = domainUrlObj.hostname
    parsed.port = domainUrlObj.port
    parsed.protocol = domainUrlObj.protocol
    }
    arguments[2] = parsed.href;
  }

  if (arguments[2] === '/login' || arguments[2] === domainUrl+'/login') {
    const page = SLUG_TO_PAGE[slug]

    if (page) {
      arguments[2] = ['/', page].join('')
      replaceState.apply(window.history, arguments)
      // window.location.reload()

      return
    }
  } else {
    const argsHttpUrl = (arguments[2] ?? '').startsWith('http') ? arguments[2] : domainUrl+arguments[2];

    if (isKnownSlug && argsHttpUrl !== [domainUrl,'/', slug].join('')) {
      return
    }
  }

  replaceState.apply(window.history, arguments)
}

const { pushState } = window.history

window.history.pushState = function () {
  if (navigationInProgress) return pushState.apply(window.history, arguments);

  const url = arguments[3];
  if(!url) return pushState.apply(window.history, arguments)

    const parsed = new URL(url, domainUrl);
    if (parsed.hostname !== domain){
      parsed.hostname = domainUrlObj.hostname
      parsed.port = domainUrlObj.port
      parsed.protocol = domainUrlObj.protocol    
    }
    arguments[3] = parsed.href;
  
  const dest = new URL(arguments[3])
  const id = dest.pathname.slice(-32)

  if (pages.includes(id)) {
    arguments[3] = ['/', PAGE_TO_SLUG[id]].join('')
  }

  return pushState.apply(window.history, arguments)
}

  

function rewriteDomA3bZ4() {
  try {
    // --- Anchor href rewriting logic ---
    document.querySelectorAll('a[href]').forEach(anchor => {
      try {
        const url = new URL(anchor.href, domainUrl);
        if (url.hostname === notionDomain || url.hostname === 'www.notion.so' ) {
          url.hostname = domainUrlObj.hostname
          url.port = domainUrlObj.port
          url.protocol = domainUrlObj.protocol
          anchor.href = url.toString();
          anchor.setAttribute('data-href', anchor.href);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    });

    // Error page detection and handling
    const svg = document.querySelector("svg.notionLogoStroked");
    const section = svg?.closest("section");
    const sectionParent = document.querySelector(".notion-cursor-listener");
    const injectErrorPage = document.querySelector(".nooxy_4f7c2b1a-error-page");
    
    // Check if this is actually an error page and not just loading
    const isActualErrorPage = section && 
      section.textContent && 
      (section.textContent.includes("page couldn’t be found") || 
       section.textContent.includes("may not have access") ||
       section.textContent.includes("deleted or moved") ||
       section.textContent.includes("Check the link and try again")
      );
    
    if(isActualErrorPage && sectionParent){
      section.style.display = 'none';
      if(!injectErrorPage) {
        sectionParent.insertAdjacentHTML("afterbegin", buildErrorPage());
      }
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
  } catch (error) {
    console.error('Error in rewriting Dom:', error);
  }
}

// Better click handling with navigation state management
document.addEventListener('click', function(event) {
const anchor = event.target.closest('a[href]');
const anchorUrl = anchor?.href;
if (anchorUrl && !navigationInProgress) {
  event.preventDefault();
    navigationInProgress = true;
  const parsed = new URL(anchorUrl, domainUrl);
  if (parsed.hostname === notionDomain || parsed.hostname === 'www.notion.so' ) {
    parsed.hostname = domainUrlObj.hostname
    parsed.port = domainUrlObj.port
    parsed.protocol = domainUrlObj.protocol  
  } 
    
    // Add small delay to prevent race conditions
    setTimeout(() => {
      window.location.href = parsed.href;
    }, 50);
    
    // Reset navigation flag after a reasonable time
    setTimeout(() => {
      navigationInProgress = false;
    }, 1000);
  }
});

// XMLHttpRequest handling
const { open } = window.XMLHttpRequest.prototype;

window.XMLHttpRequest.prototype.open = function () {
  try {
    arguments[1] = arguments[1].replace(domain, notionDomain);
    if (arguments[1].indexOf('msgstore.' + notionDomain) > -1 || 
        arguments[1].indexOf('msgstore.' + 'www.notion.so') > -1) {
      return;
    }
    open.apply(this, [].slice.call(arguments));
  } catch (error) {
    console.error('XHR error:', error);
  }
}

// Page load event listener to ensure everything is ready
window.addEventListener('load', function() {
  setTimeout(rewriteDomA3bZ4, 100); // Ensure DOM is fully ready
});

// Handle page visibility changes (when user switches tabs)
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    setTimeout(rewriteDomA3bZ4, 200); // Rewrite DOM when user returns to tab
  }
});

// Testing the fetch and xhr


  // // --- Fake 401 Response Helper ---
  // function fake200Response() {
  //   return new Response(JSON.stringify({}), {
  //     status: 200,
  //     statusText: "success",
  //     headers: { "Content-Type": "application/json" }
  //   });
  // }

  // // --- Patch fetch ---
  // const originalFetch = window.fetch;
  // window.fetch = async function () {
  //   try {
  //     const input = arguments[0]
  //     let url = typeof input === "string" ? input : input.url;
  //     let isHttp = url.startsWith("http");
  //     let parsed = null;

  //     if (isHttp) {
  //       try { parsed = new URL(url, domainUrl); } catch (e) { }
  //     }

  //     // Allow if relative or matches your domain
  //     if (!isHttp || (parsed && parsed.hostname === domain)) {
  //       return originalFetch.apply(this, [].slice.call(arguments));;
  //     }

  //     // Block others
  //     console.warn("Blocked fetch:", url);
  //     return fake200Response();
  //   } catch (err) {
  //     console.error("Fetch patch error:", err);
  //     return fake200Response();
  //   }
  // };

  // // --- Patch XMLHttpRequest ---
  // const OriginalXHROpen = window.XMLHttpRequest.prototype.open;
  // window.XMLHttpRequest.prototype.open = function () {

  //   const url = arguments[1];

  //     let isHttp = url.startsWith("http")
  //     let parsed = null;

  //     if (isHttp) {
  //       try { parsed = new URL(url, domainUrl); } catch (e) { }
  //     }

  //     const allowed = !isHttp || (parsed && parsed.hostname === domain);

  //     if (!allowed) {
  //       console.warn("Blocked XHR:", url);
  //       return
  //     }

  //   return OriginalXHROpen.apply(this, [].slice.call(arguments));

  // }

`
