// A siteIcon is a URL taken from the site config and fetched by the worker. In a
// multi-tenant deployment that config is not necessarily authored by whoever
// runs the worker, so the scheme is checked and the response is rebuilt rather
// than forwarded.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// A favicon is a few kilobytes. Anything approaching this is a misconfiguration
// or a deliberate attempt to exhaust the worker, and the whole body is buffered
// to rebuild the response.
const MAX_ICON_BYTES = 512 * 1024;

// Long enough for a slow CDN, short enough that a dead icon host does not hold
// the request open. Browsers ask for /favicon.ico on ordinary page loads, so a
// hanging fetch here stalls real traffic.
const FETCH_TIMEOUT_MS = 3000;

// Browsers request the favicon often. Without a hint the icon host is re-fetched
// on every cache miss, so a default is supplied when it sends none of its own.
const DEFAULT_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Hosts the worker must not be talked into fetching.
 *
 * Loopback reaches admin interfaces bound to localhost; 169.254.169.254 is the
 * cloud metadata service, which on a self-hosted Node deployment would hand back
 * IAM credentials as the site's favicon. Neither is a plausible place to keep an
 * icon.
 *
 * Private LAN ranges (10/8, 172.16/12, 192.168/16) are deliberately *allowed*:
 * serving assets from a sibling container is a legitimate self-hosting setup,
 * and blocking it would break working deployments to close a hole that only
 * matters when the config itself is untrusted.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  // IPv4 loopback is the whole 127/8 block, not just 127.0.0.1.
  if (/^127\./.test(host)) {
    return true;
  }
  if (host === '::1') {
    return true;
  }

  // An IPv4-mapped IPv6 address reaches the same host over a v6 socket, so it
  // must face the same rules. URL normalizes the readable spelling to hex —
  // '::ffff:127.0.0.1' becomes '::ffff:7f00:1' — so matching the dotted form was
  // matching a string this function can never receive. That let
  // [::ffff:7f00:1] and [::ffff:a9fe:a9fe] (the metadata address) straight
  // through. Decode and re-check rather than enumerate the hex ranges.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapped) {
    const high = Number.parseInt(mapped[1] ?? '', 16);
    const low = Number.parseInt(mapped[2] ?? '', 16);

    return isBlockedHost([high >>> 8, high & 0xff, low >>> 8, low & 0xff].join('.'));
  }
  // Link-local, which includes the cloud metadata address.
  if (/^169\.254\./.test(host) || host.startsWith('fe80:')) {
    return true;
  }
  // 0.0.0.0 and friends resolve to the local host on many stacks.
  if (host === '0.0.0.0' || host === '::' || host === '0') {
    return true;
  }

  return false;
}

// The only headers worth carrying from the icon host. Anything else - Set-Cookie
// above all - would otherwise be replayed onto the site's own domain.
const FORWARDED_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'];

// Redirects are followed by hand so each hop can be checked before it is
// requested. Three is plenty for a CDN; more suggests a loop.
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Reads at most `limit` bytes and gives up rather than finishing the body.
 *
 * response.arrayBuffer() buffers everything before any size check can run, so a
 * host that omits or understates content-length was bounded only by the fetch
 * timeout — 8 MB arrived in about a second in testing. Reading incrementally
 * caps what a hostile or misconfigured icon host can cost in memory.
 *
 * @returns the bytes, or null if the body exceeded the limit
 */
async function readAtMost(response: Response, limit: number): Promise<ArrayBuffer | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new ArrayBuffer(0);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let chunk = await reader.read();

  while (!chunk.done) {
    total += chunk.value.byteLength;
    if (total > limit) {
      await reader.cancel();

      return null;
    }
    chunks.push(chunk.value);
    chunk = await reader.read();
  }

  const body = new ArrayBuffer(total);
  const view = new Uint8Array(body);
  let offset = 0;
  for (const piece of chunks) {
    view.set(piece, offset);
    offset += piece.byteLength;
  }

  return body;
}

/**
 * Fetches the icon, validating every redirect target before it is requested.
 *
 * `redirect: 'follow'` with a check on the final URL still *contacted* every
 * intermediate host, so a chain through 127.0.0.1 or the metadata address made
 * the request even though its response was discarded. 'manual' moves the check
 * in front of each hop.
 *
 * @returns the response, or null if a hop was disallowed or the chain was too long
 */
async function fetchIconFollowingSafeRedirects(start: URL): Promise<Response | null> {
  let target = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      console.error('!! siteIcon redirected to an unparseable location:', location);

      return null;
    }

    if (!ALLOWED_PROTOCOLS.has(next.protocol) || isBlockedHost(next.hostname)) {
      console.error('!! siteIcon redirected to a disallowed host:', next.toString());

      return null;
    }

    target = next;
  }

  console.error(`!! siteIcon redirected more than ${MAX_REDIRECTS} times:`, start.toString());

  return null;
}

/**
 * Serves the configured favicon.
 *
 * @param siteIcon - URL from the site config
 * @returns the icon response, or null to fall back to the proxied Notion favicon
 */
export async function handleFavicon(siteIcon: string): Promise<Response | null> {
  let iconUrl: URL;
  try {
    iconUrl = new URL(siteIcon);
  } catch {
    console.error('!! Invalid siteIcon in site config:', siteIcon);

    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(iconUrl.protocol)) {
    console.error('!! siteIcon must be an http(s) URL:', siteIcon);

    return null;
  }

  if (isBlockedHost(iconUrl.hostname)) {
    console.error('!! siteIcon may not point at a loopback or link-local address:', siteIcon);

    return null;
  }

  try {
    const response = await fetchIconFollowingSafeRedirects(iconUrl);
    if (!response) {
      return null;
    }

    if (!response.ok) {
      console.error('!! siteIcon fetch failed with status', response.status, siteIcon);

      return null;
    }

    // Refuse an oversized icon before reading it, when the host says how big it
    // is. content-length is only a hint, so the stream is capped as well.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_ICON_BYTES) {
      console.error(`!! siteIcon is ${declared} bytes, over the ${MAX_ICON_BYTES} limit:`, siteIcon);

      return null;
    }

    const body = await readAtMost(response, MAX_ICON_BYTES);
    if (body === null) {
      console.error(`!! siteIcon exceeded the ${MAX_ICON_BYTES} byte limit while reading:`, siteIcon);

      return null;
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = response.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
    if (!headers.has('content-type')) {
      headers.set('content-type', 'image/x-icon');
    }
    if (!headers.has('cache-control')) {
      headers.set('cache-control', DEFAULT_CACHE_CONTROL);
    }

    return new Response(body, { status: 200, headers });
  } catch (error) {
    // An unreachable, slow or aborted icon host must not take the whole request
    // down with it — the proxied Notion favicon is a fine fallback.
    console.error('!! Failed to fetch siteIcon:', error);

    return null;
  }
}
