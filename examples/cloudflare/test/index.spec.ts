// These replaced the Workers starter template, which asserted `"Hello World!"`
// against a worker that has only ever returned `proxy(request)`. Those
// assertions could not have passed at any point.
//
// The template's integration test also resolved against live Notion, so running
// the suite made real outbound requests. `disableNetConnect()` below turns that
// into a loud failure rather than a slow, flaky pass.

import { createExecutionContext, env, fetchMock, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';

// All three come from nooxy/config.js. The request host has to match `domain`
// or the proxy has no slug map to resolve against, and UPSTREAM_PATH is the
// page id that `slugToPage['/']` resolves to.
const SITE = 'https://your-domain.com';
const UPSTREAM = 'https://your-workspace.notion.site';
const UPSTREAM_PATH = '/NOTION_HOME_PAGE_ID';

// The `</head>` is the point: nooxy injects its runtime just before it, so
// markup without one would pass through untouched and prove nothing.
const NOTION_HTML = '<html><head><title>Page</title></head><body>notion</body></html>';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

beforeAll(() => {
	fetchMock.activate();
	// Anything the interceptors below do not cover now throws, instead of
	// quietly leaving the machine.
	fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

// The path is pinned rather than matched loosely. A wildcard would serve the
// upstream response whatever nooxy asked for, so a slug resolving to the wrong
// page would still pass. Pinning it makes this assert the routing.
function mockNotion() {
	fetchMock.get(UPSTREAM).intercept({ path: UPSTREAM_PATH }).reply(200, NOTION_HTML, {
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
}

describe('nooxy proxy worker', () => {
	it('proxies the configured root slug and injects the nooxy runtime', async () => {
		mockNotion();

		const ctx = createExecutionContext();
		const response = await worker.fetch(new IncomingRequest(`${SITE}/`), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		// Asserting the injection rather than a body snapshot: the upstream markup
		// belongs to Notion and would make this test theirs to break.
		expect(await response.text()).toContain('window.nooxy');
	});

	it('serves the same page end to end', async () => {
		mockNotion();

		const response = await SELF.fetch(`${SITE}/`);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('window.nooxy');
	});
});
