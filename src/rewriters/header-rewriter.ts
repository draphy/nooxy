// Helper function to modify request headers
export function modifyRequestHeaders(headers: Headers): Headers {
  const newHeaders = new Headers(headers);
  newHeaders.delete('accept-encoding');
  return newHeaders;
}

// Helper function to modify response headers
export function modifyResponseHeaders(headers: Headers, hostname: string): Headers {
  const newHeaders = new Headers(headers);

  // Handle cookies
  const cookies = headers.get('set-cookie');
  if (cookies) {
    // Note: set-cookie can have multiple values, but Headers.get() returns them comma-separated
    // For proper cookie handling, we'd need to parse them individually
    const modifiedCookies = cookies.replace(/((?:^|; )Domain=)(?:[^.]+\.)?notion\.site(;|$)/gi, `$1${hostname}$2`);
    newHeaders.set('set-cookie', modifiedCookies);
  }

  // Handle CSP
  const csp = headers.get('content-security-policy');
  if (csp) {
    let modifiedCsp = csp
      .replace(
        /(?=(script-src|connect-src) )[^;]*/g,
        '$& https://www.googletagmanager.com https://www.google-analytics.com',
      )
      .replace(/(?=(style-src) )[^;]*/g, '$& https://fonts.googleapis.com')
      .replace(/(?=(font-src) )[^;]*/g, '$& https://fonts.gstatic.com')
      .replace(/frame-ancestors[^;]*/g, 'frame-ancestors *');
    // Force frame-ancestors to *
    if (!/frame-ancestors/.test(modifiedCsp)) {
      modifiedCsp += '; frame-ancestors *';
    }
    newHeaders.set('content-security-policy', modifiedCsp);
  }

  return newHeaders;
}
