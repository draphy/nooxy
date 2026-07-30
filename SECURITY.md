# Security Policy

## Supported versions

Only the latest release on npm receives security fixes. Nothing is backported to
earlier minors, so upgrade before reporting against an older version.

The `beta` dist-tag is not a supported channel. It currently resolves to a
pre-1.0 build and should not be used in production.

## Reporting a vulnerability

Open a [security advisory](https://github.com/draphy/nooxy/security/advisories/new).
Please do not use the public issue tracker.

Include the nooxy version, where it runs, and enough detail to reproduce the
problem. A short proof of concept is worth more than a long description.

Nooxy is maintained by one person, so expect an acknowledgement within a week
rather than the same day. After that, progress is posted in the advisory thread
until a fix ships. If a report turns out to be out of scope, you get an
explanation rather than silence.

## What we ask of you

- Do not exploit the problem beyond what is needed to demonstrate it.
- Do not access, change or delete data that is not yours.
- Keep the report private until a fix is released, or until 90 days have passed.

## What you get in return

- If you follow this policy, no legal action will be taken over your report.
- Your report stays confidential, and your details are not shared without your
  permission.
- Credit in the advisory, unless you would rather stay anonymous.

## Security model

Nooxy sits between visitors and Notion, so it helps to be explicit about where
the trust boundary is. A report counts as a nooxy vulnerability only if it does
not need something on the trusted side to be compromised first.

**Not trusted.** Treat these as hostile.

- Inbound requests. Any path, query, header or cookie may be attacker
  controlled.
- URLs discovered in a page that nooxy then fetches, favicons in particular.
  Getting nooxy to reach a private or internal address belongs here.
- Responses from Notion, to the extent they are parsed or rewritten into output.

**Trusted.** Assumed to be under your control.

- Your config, and any `head.js`, `head.css`, `body.js` or `header.html` you
  supply. These are developer authored and run with the same privileges as the
  site, so injecting script through them is the feature working as designed.
- The runtime and its host, whether Cloudflare Workers, Node, Deno or Bun.
- The CLI. `nooxy init` and `nooxy generate` are developer tools that write
  where you point them, run on your own machine with your own permissions.
- Notion itself. Problems in Notion's own product go to Notion.

Reports that fall outside this model still get fixed if they are real problems.
They just do not get an advisory or a CVE.

## Supply chain

Nooxy ships with zero runtime dependencies, so installing it pulls in no
third-party code. The only dependencies in the repository are development ones,
which never reach a user's deployment.

## Verifying a release

Releases are published from GitHub Actions using npm trusted publishing, which
attaches a [provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
binding the tarball to the workflow and commit that produced it. Attestations
start at **1.7.0**. Earlier releases, 1.0.0 through 1.6.0, have none.

Verify with:

```bash
npm audit signatures
```

A pass proves the tarball came from this repository's Actions workflow and was
not altered on the way to the registry. It does not prove the code in that
commit is free of bugs.

If a version at or above 1.7.0 reports a missing or invalid attestation, treat
it as a possible supply chain problem and report it through the private channel
above.
