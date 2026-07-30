# Test fixtures

## `notion-page.html`

The HTML shell Notion serves for a public page, captured from a live site so the
rewriters are tested against markup Notion actually produces rather than markup
written to match what the rewriters expect. See the header of
`test/notion-integration.test.mjs` for what that buys.

It is the app shell only — page content loads over Notion's API afterwards — so
there is no **author** content in it: no page text, no author-written title, no
author images, and no workspace subdomain. The meta descriptions are Notion's own
marketing copy.

What it does contain, all of it Notion's own and none of it identifying:

- `<title>Notion</title>` — the generic shell title, not the page's
- one `<img>` and an `og:image` pointing at `app.notion.com/images/meta/default.png`
- `app.notion.com` as the only host; no `*.notion.site` workspace address

### It has been sanitised

Two identifiers came with the capture and were replaced with invented values:

| Original | Replaced with | What it was |
| --- | --- | --- |
| the page's UUID | `22222222-2222-2222-2222-222222222222` | the captured page's id, now the harness's `PAGE.about` |
| a telemetry token | `00000000-0000-0000-0000-000000000000` | an `Authorization:` value in Notion's own bundle |

`test/fixture-hygiene.test.mjs` enforces this. Every identifier-shaped string in
`test/` and `scripts/` must appear in that file's allowlist, so a refreshed
capture carrying a real page id, workspace hostname, email or token fails the
suite and names the value instead of being missed in 18KB of minified HTML.

### Refreshing it

1. Fetch the page from the **Notion** domain (`<workspace>.notion.site/<id>`),
   not from the proxied site — the fixture is the proxy's *input*.
2. Run `pnpm test`. The hygiene check will list anything that needs replacing,
   and the "captured fixture is the input this suite thinks it is" tests will
   flag it if Notion has changed the properties the other tests depend on —
   chiefly that meta tags are written unclosed. **Every one of them is** — not
   most — which is the point: the rewriter's patterns have to match `<meta …>`
   and not only `<meta … />`. The test asserts zero self-closing tags rather than
   a threshold, so a refresh that closed half of them fails loudly instead of
   quietly halving what this fixture exercises. No count is written down here on
   purpose; the assertion is the record.
3. Replace each flagged identifier with an invented one and add it to the
   allowlist with a reason.
