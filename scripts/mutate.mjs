// Mutation testing: deliberately break the source, and check the suite notices.
//
// Coverage says a line ran. It does not say an assertion would have failed had
// that line been wrong. This script answers the second question, which is the
// one that matters for "will these tests catch a regression".
//
// Every mutation below is modelled on a real defect from this codebase's
// history, not invented at random, so a survivor names a class of bug that
// could be reintroduced today without a single test going red.
//
// Usage: pnpm test:mutation [-- <substring>]        (filters by mutation name)
//        pnpm test:mutation -- --shard=3/12         (runs one shard, as CI does)
//
// SAFETY: every target file is hashed before anything is touched and verified
// byte-identical at the end — and so are the files the build *derives* from them
// (see DERIVED), because restoring a source does not undo a rebuild made from the
// mutated version. Restoration happens in a finally block and in signal handlers,
// and the script refuses to exit quietly if a file was left modified.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `find` must match exactly once in the file — a mutation that silently applies
 * to nothing would be reported as "caught" by whichever test happens to fail,
 * or worse, as a survivor with no mutation actually present.
 */
const MUTATIONS = [
  {
    name: 'proxy: allow requests that resolve outside the Notion origin',
    file: 'src/proxy.ts',
    // A weakening that still compiles. Stubbing the whole branch out would be
    // rejected by the toolchain, which proves only that the mutation was clumsy
    // — this one type-checks and lints clean, so it can only be caught by a test.
    find: 'if (targetUrl.origin !== notionDomainUrl) {',
    replace: 'if (!targetUrl.origin.endsWith(notionDomainUrl.slice(-4))) {',
    note: 'the SSRF guard',
  },
  {
    // Notion loads all page content over POST. Without duplex the upstream
    // Request throws under Node, so a self-hosted site served an empty shell.
    name: 'proxy: forward a body without declaring duplex',
    file: 'src/proxy.ts',
    find: "...(hasBody ? { body: request.body, duplex: 'half' } : {}),",
    replace: 'body: request.body,',
    note: 'every POST failing on a Node deployment',
  },
  {
    name: 'proxy: write the localhost domain back into the cached config',
    file: 'src/proxy.ts',
    find: 'const siteConfig = url.isLocalhost ? { ...cachedConfig, domain: url.domain } : cachedConfig;',
    replace:
      'const siteConfig = cachedConfig; if (url.isLocalhost) { (cachedConfig as { domain: string }).domain = url.domain; }',
    note: 'cached-config poisoning from a single localhost request',
  },
  {
    name: 'meta: use a replacement string instead of a replacer function',
    file: 'src/rewriters/meta-rewriter.ts',
    find: 'return html.replace(pattern, () => tag);',
    replace: 'return html.replace(pattern, tag);',
    note: '$& and friends corrupting an injected tag',
  },
  {
    name: 'meta: require meta tags to be self-closing',
    file: 'src/rewriters/meta-rewriter.ts',
    find: "${META_ATTRIBUTES}\\\\/?>`, 'gi');",
    replace: "${META_ATTRIBUTES}\\\\/>`, 'gi');",
    note: 'real Notion writes most meta tags unclosed',
  },
  {
    name: 'meta: stop matching a > inside a quoted attribute value',
    file: 'src/rewriters/meta-rewriter.ts',
    // Back to the form that cannot cross a '>' in an attribute value, so an
    // existing tag is missed and a duplicate is inserted beside it.
    find: 'const META_ATTRIBUTES = String.raw`(?:[^>"\']|"[^"]*"|\'[^\']*\')*`;',
    replace: 'const META_ATTRIBUTES = String.raw`[^>]*`;',
    note: 'two description tags on a page whose meta content contains >',
  },
  {
    name: 'meta: stop escaping config values into HTML',
    file: 'src/rewriters/meta-rewriter.ts',
    find: 'const safeCanonicalUrl = escapeHtml(canonicalUrl);',
    replace: 'const safeCanonicalUrl = canonicalUrl;',
    note: 'attribute injection from a configured value',
  },
  {
    name: 'headers: collapse every Set-Cookie into one header',
    file: 'src/rewriters/header-rewriter.ts',
    find: "typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')]",
    replace: "[headers.get('set-cookie')]",
    note: 'losing every cookie after the first',
  },
  {
    name: 'headers: interpolate the host into the replacement string',
    file: 'src/rewriters/header-rewriter.ts',
    find: '(_match, prefix: string, suffix: string) => `${prefix}${hostname}${suffix}`,',
    replace: '`$1${hostname}$2`,',
    note: 'a $ in the Host header corrupting the cookie',
  },
  {
    name: 'helpers: expand $ patterns in the resolved page id',
    file: 'src/helpers/index.ts',
    find: 'return url.replace(regex, () => `/${pageId}`);',
    replace: 'return url.replace(regex, `/${pageId}`);',
    note: 'a $ in a configured page id splicing the URL into the path',
  },
  {
    name: 'favicon: allow loopback and link-local icon hosts',
    file: 'src/handlers/handle-favicon.ts',
    // Compiles and lints clean, so only a test can catch it.
    find: '  if (isBlockedHost(iconUrl.hostname)) {',
    replace: "  if (isBlockedHost('cdn.example')) {",
    note: 'SSRF to the cloud metadata service via siteIcon',
  },
  {
    name: 'favicon: drop the size limit',
    file: 'src/handlers/handle-favicon.ts',
    // The cap now lives inside readAtMost, which stops reading rather than
    // buffering the whole body and measuring it afterwards.
    find: '    if (total > limit) {',
    replace: '    if (total > limit * 1000) {',
    note: 'an unbounded icon body exhausting the worker',
  },
  {
    name: 'favicon: follow redirects without checking each hop',
    file: 'src/handlers/handle-favicon.ts',
    // Compiles and lints clean: the hop is still fetched, just never validated.
    find: '    if (!ALLOWED_PROTOCOLS.has(next.protocol) || isBlockedHost(next.hostname)) {',
    replace: '    if (!ALLOWED_PROTOCOLS.has(next.protocol) && isBlockedHost(next.hostname)) {',
    note: 'a redirect chain reaching loopback or the metadata address',
  },
  {
    name: 'favicon: stop blocking IPv4-mapped IPv6 hosts',
    file: 'src/handlers/handle-favicon.ts',
    find: '  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);',
    replace: '  const mapped = /^::ffff:nevermatches$/.exec(host);',
    note: 'SSRF to the metadata service via [::ffff:a9fe:a9fe]',
  },
  {
    name: 'headers: forward content-encoding with a decoded body',
    file: 'src/rewriters/header-rewriter.ts',
    // `wasEncoded` is still assigned, so this compiles and lints clean; the header
    // simply stops being removed.
    find: "  const wasEncoded = newHeaders.has('content-encoding');\n  newHeaders.delete('content-encoding');",
    replace: "  const wasEncoded = newHeaders.has('content-encoding');",
    note: 'binary downloads arriving labelled gzip but already decompressed',
  },
  {
    name: 'headers: keep a compressed content-length on a decoded body',
    file: 'src/rewriters/header-rewriter.ts',
    // Narrows the condition back to the rewritten-body case only, so a decompressed
    // passthrough keeps a length describing the compressed bytes.
    find: '  if (wasEncoded || bodyModified) {',
    replace: '  if (bodyModified) {',
    note: 'a content-length describing the compressed size of a decoded body',
  },
  {
    name: 'meta: append meta tags to a document with no head',
    file: 'src/rewriters/meta-rewriter.ts',
    // Restores the old fallback. Written as a change to the final return so it
    // compiles and lints clean — inserting an early return above left the rest of
    // the function unreachable, which the toolchain caught before any test could.
    find: '  // alone is the only safe answer.\n  return html;\n}',
    replace: '  // alone is the only safe answer.\n  return html + tag;\n}',
    note: 'markup appended into a JSON response, breaking the page',
  },
  {
    name: 'data: sniff the body for <html instead of trusting the content type',
    file: 'src/rewriters/data-rewriter.ts',
    find: "  return contentType === '' && /^\\s*(?:<!DOCTYPE\\s+html|<html[\\s>])/i.test(data);",
    replace: '  return /<html/i.test(data);',
    note: 'a JSON API response treated as HTML and rewritten',
  },
  {
    name: 'data: embed config JSON without escaping <',
    file: 'src/rewriters/data-rewriter.ts',
    find: "  return JSON.stringify(value).replace(/</g, '\\\\u003c');",
    replace: '  return JSON.stringify(value);',
    note: 'a slug containing </script> closing the injected script element',
  },
  {
    name: 'data: match only the last identifier of the Sentry callee',
    file: 'src/rewriters/data-rewriter.ts',
    // The form that broke `window.Sentry.init(` into `window.({init:...}).init(`,
    // a syntax error that would have killed the whole Notion bundle.
    find: ".replace(/[\\w$]+(?:\\.[\\w$]+)*(?=\\.init\\({dsn:)/, '({init:function(){}})')",
    replace: ".replace(/[\\w$]+(?=\\.init\\({dsn:)/, '({init:function(){}})')",
    note: 'a dotted Sentry callee producing an unparseable bundle',
  },
  {
    name: 'config: stop warning about duplicate pageMetadata',
    file: 'src/helpers/config-loader.ts',
    // Inverted rather than disabled: `metadataSource[pageId]` looked like a
    // weakening but is equivalent, because the colliding key is written under the
    // normalized id and read back under the same one.
    find: '      if (metadataSource[normalized]) {',
    replace: '      if (!metadataSource[normalized]) {',
    note: 'a page silently losing its title and description',
  },
  {
    name: 'cli: ignore init failures and generate anyway',
    file: 'src/cli/index.ts',
    find: '    if (scaffolded.failed > 0) {\n      return 1;\n    }',
    replace: '    if (scaffolded.failed > 99) {\n      return 1;\n    }',
    note: 'init reporting success when the package is incomplete',
  },
  {
    name: 'helpers: compare the URL scheme case-sensitively',
    file: 'src/helpers/index.ts',
    find: 'const scheme = input.slice(0, 8).toLowerCase();',
    replace: 'const scheme = input.slice(0, 8);',
    note: 'HTTP:// being fetched as https://http/',
  },
  {
    name: 'helpers: let the /200 route swallow longer slugs',
    file: 'src/helpers/index.ts',
    find: '/^\\/200(?:\\/|$)/',
    replace: '/^\\/200\\/?/',
    note: 'a configured /2000 slug becoming unreachable',
  },
  {
    name: 'favicon: forward every upstream header',
    file: 'src/handlers/handle-favicon.ts',
    find: 'const FORWARDED_HEADERS = ',
    replace: 'const UNUSED_FORWARDED_HEADERS = ',
    note: 'replaying Set-Cookie on the site domain',
  },
  {
    name: 'minify: never treat a slash as the start of a regex',
    file: 'src/lib/minify.js',
    // Mutating the final return keeps every branch reachable, so the lint step
    // has nothing to object to and the tests have to do the work.
    find: "  if (isWordChar(lastChar) || lastChar === ']') {\n    return false;\n  }\n  return true;\n}",
    replace: "  if (isWordChar(lastChar) || lastChar === ']') {\n    return false;\n  }\n  return false;\n}",
    note: 'a regex containing a space being minified into a different regex',
  },
  {
    name: 'minify: drop every newline',
    file: 'src/lib/minify.js',
    find: 'return EXPRESSION_CONTINUES_AFTER.has(prev) || EXPRESSION_CONTINUES_BEFORE.has(next);',
    replace: 'return true;',
    note: 'ASI joining two statements into one broken one',
  },
  {
    name: 'minify: accept output that failed the sanity check',
    file: 'src/lib/minify.js',
    find: 'function assertMinifiedIsSane(',
    replace: 'function assertMinifiedIsSane() {\n  return;\n}\nfunction unusedAssertMinifiedIsSane(',
    note: 'shipping an empty or unparseable bundle',
  },
  {
    // The original reported defect: the address bar settling on a 32-character
    // page id instead of the slug. _yourUrl could not invert the server's
    // slug -> page id mapping, so there was nothing to translate back.
    name: 'head.js: stop resolving page ids back to slugs',
    file: 'src/rewriters/custom/head.js',
    find: "  return match ? match[1].toLowerCase() : '';",
    replace: "  return '';",
    note: 'the page id flash in the address bar',
  },
  {
    name: 'config: stop normalizing dashed page ids',
    file: 'src/helpers/config-loader.ts',
    find: "const compact = pageId.trim().replace(/-/g, '').toLowerCase();",
    replace: 'const compact = pageId;',
    note: 'a dashed page id from the Notion URL bar never matching',
  },
  {
    name: 'cli: report success for an asset that was never written',
    file: 'src/cli/generate.ts',
    find: '      result.missing += 1;\n      continue;',
    replace: '      result.missing += 1;\n      console.log(`✅ Generated ${outputPath}`);\n      continue;',
    note: 'the CLI claiming to have generated a missing file',
  },
  {
    name: 'cli: skip the empty constant for a missing source',
    file: 'src/cli/generate.ts',
    // Back to skipping the write. nooxy/config.js imports all four generated
    // modules unconditionally, so the site then fails to start with
    // "Cannot find module" — while the README calls these files optional.
    find: "      fs.writeFileSync(outputPath, `export const ${asset.constant} = \\`\\`;\\n`, 'utf8');",
    replace: '      // not written',
    note: 'a project without body.js producing a config that cannot be imported',
  },
  {
    name: 'cli: silently ignore an unrecognised option',
    file: 'src/cli/index.ts',
    find: '      console.error(`⚠️  Unrecognised option: ${arg}`);\n      console.error(USAGE);\n\n      return null;',
    replace: '      // swallowed',
    note: 'a typo such as --no-minfy doing nothing',
  },
  {
    name: 'cli: generate into a directory that has no nooxy/ folder',
    file: 'src/cli/generate.ts',
    // Checks the project root instead of the nooxy/ folder inside it. Compiles and
    // lints clean, and is the actual bug: the root exists, so the guard passes and
    // mkdir builds a stray tree. `&& false` was caught by the linter instead.
    find: '  if (!fs.existsSync(nooxyDir)) {',
    replace: '  if (!fs.existsSync(rootDir)) {',
    note: 'a stray nooxy/generated/ tree created in the wrong folder, reported as success',
  },
  {
    name: 'cli: accept options for init and ignore them',
    file: 'src/cli/index.ts',
    find: '    if (args.length > 0) {',
    replace: '    if (args.length > 99) {',
    note: 'nooxy init --path=... scaffolding into the wrong directory silently',
  },
];

const args = process.argv.slice(2);

/**
 * Validated before the name filter, not after.
 *
 * `--shard 1/12` with a space arrives as two arguments, and the second would
 * otherwise be read as a name filter and fail with "No mutation matches 1/12",
 * which points at the wrong thing.
 *
 * Matching on the `--shard` prefix rather than `--shard=` is deliberate: it is
 * what makes `--shard`, `--shard=`, `--shards=1/12` and `--shard=1.9/12` all
 * fail loudly. Reading only `--shard=` left every one of them falsy, which
 * silently ran the whole suite instead of a twelfth of it — 27 minutes when you
 * asked for 27 seconds, and in CI a timeout that blames the wrong thing.
 */
const shardFlag = args.find((a) => a.startsWith('--shard'));

if (shardFlag && !/^--shard=\d+\/\d+$/.test(shardFlag)) {
  console.error(`Expected --shard=i/n with whole numbers, got ${JSON.stringify(shardFlag)}`);
  process.exit(1);
}

const filter = args.find((a) => !a.startsWith('--'));
const filtered = filter ? MUTATIONS.filter((m) => m.name.includes(filter)) : MUTATIONS;

if (filtered.length === 0) {
  console.error(`No mutation matches ${JSON.stringify(filter)}`);
  process.exit(1);
}

/**
 * Splits the run across parallel CI jobs: --shard=2/6 runs the second sixth.
 *
 * Round robin rather than contiguous slices, deliberately. Mutations are grouped
 * by file in the list above, and a contiguous slice would hand one shard every
 * favicon mutation while another got every CLI one. Their runtimes differ enough
 * that the slowest shard would decide the wall clock. Striding by shard count
 * mixes the files evenly instead.
 *
 * Every shard still rebuilds and re-verifies the whole tree, so a shard is a
 * complete run over fewer mutations, not a partial run.
 */
let selected = filtered;

if (shardFlag) {
  // Shape is already guaranteed by the check above, so only the range is left.
  const [rawIndex, rawTotal] = shardFlag.slice('--shard='.length).split('/');
  const index = Number.parseInt(rawIndex, 10);
  const total = Number.parseInt(rawTotal, 10);

  if (total < 1 || index < 1 || index > total) {
    console.error(`Expected --shard=i/n with 1 <= i <= n, got ${JSON.stringify(shardFlag)}`);
    process.exit(1);
  }

  selected = filtered.filter((_, i) => i % total === index - 1);
  console.log(`shard ${index}/${total}: ${selected.length} of ${filtered.length} mutations\n`);

  // A shard with nothing to do is not an error. It means more shards than
  // mutations, which is wasteful but not wrong, and failing here would turn a
  // harmless matrix into a red build.
  if (selected.length === 0) {
    console.log('nothing to do in this shard');
    process.exit(0);
  }
}

const hash = (file) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, file)))
    .digest('hex');

const targets = [...new Set(selected.map((m) => m.file))];

/**
 * Files the build derives from a mutation target, which restoring the source does
 * not put back.
 *
 * `pnpm build` regenerates these from head.js using minify.js — both mutation
 * targets. So mutating either one, building, and restoring the source left the
 * *generated* file holding output built from the mutated source. That is not
 * hypothetical: it happened, and was noticed only when 700 passing tests dropped
 * to 31. Hashing them here makes the integrity check cover what it claims to.
 */
const DERIVED = [
  'src/rewriters/custom/generated/_head-js-string.ts',
  'src/rewriters/custom/generated/_head-css-string.ts',
];

const guarded = [...new Set([...targets, ...DERIVED])];
const before = Object.fromEntries(guarded.map((file) => [file, hash(file)]));

// On Windows `pnpm` is a .cmd shim, and execFileSync does not resolve those —
// it would fail with ENOENT before a single mutation ran.
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(args, env) {
  try {
    execFileSync(PNPM, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...env } });
    return { ok: true };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

/**
 * Skips `biome:fix` inside the loop. Formatting cannot change behaviour, so it
 * cannot change whether a mutation is caught, and it ran on every build.
 *
 * It is also the one step in the loop that writes to files other than the one
 * being mutated, so dropping it removes a source of drift rather than adding
 * one. The final rebuild below still runs the full build, formatting included,
 * because that is what the integrity check compares against.
 */
const LOOP_BUILD_ENV = { NOOXY_SKIP_FORMAT: '1' };

/**
 * Matches a mutation against a file, tolerating CRLF.
 *
 * .gitattributes checks everything out as LF, but a clone made before that was
 * added still has CRLF on Windows — and the multi-line `find` strings below are
 * written with \n. Without this they would match nothing and every one of them
 * would be reported as stale, which reads as "the code moved" rather than "your
 * line endings differ".
 */
function locate(source, mutation) {
  let best = 0;
  for (const find of [mutation.find, mutation.find.replace(/\n/g, '\r\n')]) {
    const occurrences = source.split(find).length - 1;
    best = Math.max(best, occurrences);
    if (occurrences === 1) {
      const crlf = find !== mutation.find;
      return { find, replace: crlf ? mutation.replace.replace(/\n/g, '\r\n') : mutation.replace, occurrences: 1 };
    }
  }

  // The count from whichever line-ending variant matched most, so "matched 3
  // times" is reported instead of the LF count of 0 — which read as "the code
  // moved" when the real answer was "your line endings differ".
  return { find: null, replace: null, occurrences: best };
}

/**
 * Applies a mutation without letting the replacement text be reinterpreted.
 *
 * String.replace treats '$&', '$`', "$'" and '$n' in the replacement as
 * substitution patterns. One mutation's replacement already contains '$1' and
 * '$2' and survives only because a string search pattern has no capture groups,
 * which makes '$n' literal — but '$&' would expand regardless. A replacer
 * function removes the whole hazard, which is exactly what the mutation on
 * header-rewriter.ts exists to check for.
 */
function applyMutation(source, find, replace) {
  return source.replace(find, () => replace);
}

/**
 * The mutation currently written to disk, so it can be undone from anywhere.
 *
 * A `finally` block is not enough on its own: this script spends nearly all of
 * its run inside blocking execFileSync calls, and `finally` does not run when
 * Node is terminated by a signal. Without the handlers below, Ctrl-C left a
 * source file holding a deliberately injected bug — a disabled SSRF guard, say —
 * and skipped the integrity check that would have caught it.
 */
let inFlight = null;

function restore() {
  if (inFlight) {
    fs.writeFileSync(inFlight.path, inFlight.original);
    inFlight = null;
  }
}

// Must stay synchronous: no async work runs during 'exit'.
process.on('exit', restore);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    // Read the path before restoring — restore() clears inFlight.
    const interrupted = inFlight ? path.relative(ROOT, inFlight.path) : null;
    restore();
    console.error(`\n!! ${signal} — ${interrupted ? `restored ${interrupted}` : 'nothing to restore'}, stopping.`);
    // Ctrl-C reaches the whole process group, so it can also kill a `pnpm build`
    // midway. That build regenerates src/rewriters/custom/generated/* and runs
    // biome --write, so those files may now reflect a mutated source even though
    // the source itself has been put back. Restoring them is not this script's
    // job, but saying so is.
    console.error('!! An interrupted build may have left generated files stale.');
    console.error('!! Check with:  git status && pnpm build');
    // 128 + signal number, the conventional shell encoding for "killed by signal".
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

/**
 * The suite has to be green before anything is broken on purpose.
 *
 * A mutation is judged caught when `pnpm test` fails. If it already fails, every
 * mutation is caught for a reason that has nothing to do with the mutation, and
 * the run reports zero survivors while proving nothing. Measured on a tree with
 * 69 unrelated failures: three of three mutations "caught", all meaningless.
 *
 * Stryker runs a dry run first for the same reason — it checks the setup
 * succeeds while no mutant is active. Costs one build and one suite per shard.
 */
process.stdout.write('baseline: build + suite ... ');

const baselineBuild = run(['build'], LOOP_BUILD_ENV);

if (!baselineBuild.ok) {
  console.log('FAILED');
  console.error('\nThe build fails with no mutation applied, so nothing below would mean anything.\n');
  console.error(baselineBuild.output.trim().split('\n').slice(-15).join('\n'));
  process.exit(2);
}

const baselineTest = run(['test']);

if (!baselineTest.ok) {
  console.log('FAILED');
  console.error('\nThe suite fails with no mutation applied. Every mutation below would be');
  console.error('reported as caught, and this run would claim a perfect score while proving');
  console.error('nothing. Fix the failing tests first.\n');
  console.error(baselineTest.output.trim().split('\n').slice(-15).join('\n'));
  process.exit(2);
}

console.log('green\n');

const results = [];

for (const [index, mutation] of selected.entries()) {
  const absolute = path.join(ROOT, mutation.file);
  const original = fs.readFileSync(absolute, 'utf8');
  const located = locate(original, mutation);
  const occurrences = located.occurrences;

  process.stdout.write(`[${index + 1}/${selected.length}] ${mutation.name} ... `);

  if (occurrences !== 1) {
    // The source moved out from under the mutation. Reporting this as a
    // survivor would be a lie, and reporting it as caught would hide the fact
    // that this mutation is no longer testing anything.
    console.log(`STALE (matched ${occurrences} times)`);
    results.push({ ...mutation, status: 'stale' });
    continue;
  }

  try {
    inFlight = { path: absolute, original };
    fs.writeFileSync(absolute, applyMutation(original, located.find, located.replace));

    const built = run(['build'], LOOP_BUILD_ENV);
    if (!built.ok) {
      // A mutation the compiler rejects is caught by the toolchain, which is a
      // legitimate defence — but a weaker one than a failing test, so it is
      // reported separately rather than counted as a pass.
      console.log('caught (build)');
      results.push({ ...mutation, status: 'caught-build' });
      continue;
    }

    const tested = run(['test']);
    console.log(tested.ok ? 'SURVIVED' : 'caught');
    results.push({ ...mutation, status: tested.ok ? 'survived' : 'caught' });
  } finally {
    restore();
  }
}

// Rebuild first: the last mutant's build is still on disk, and for a mutation
// that targeted head.js or minify.js the committed generated/* files were
// produced from mutated source. Restoring the source does not undo that, so the
// integrity check below has to run *after* a clean rebuild, not before it.
const rebuilt = run(['build']);
if (!rebuilt.ok) {
  // Silently ignoring this used to leave generated/* and dist derived from the
  // last mutant with a zero exit code.
  console.error('\n!! The final rebuild failed, so generated files and dist may still hold mutated output.');
  console.error(rebuilt.output?.split('\n').slice(-15).join('\n') ?? '');
  process.exit(2);
}

const drift = guarded.filter((file) => hash(file) !== before[file]);
if (drift.length > 0) {
  console.error(`\n!! Files were not restored: ${drift.join(', ')}`);
  console.error(`!! Recover with:  git checkout -- ${drift.join(' ')}`);
  process.exit(2);
}

const counted = (status) => results.filter((r) => r.status === status);
const survived = counted('survived');
const stale = counted('stale');

console.log(`\n${'-'.repeat(60)}`);
console.log(`caught by a test  ${counted('caught').length}`);
console.log(`caught by build   ${counted('caught-build').length}`);
console.log(`survived          ${survived.length}`);
if (stale.length > 0) {
  console.log(`stale             ${stale.length}`);
}

for (const mutation of survived) {
  console.log(`\nSURVIVED: ${mutation.name}\n  ${mutation.file} — ${mutation.note}`);
}
for (const mutation of stale) {
  console.log(`\nSTALE: ${mutation.name}\n  ${mutation.file} — the code it targets has changed`);
}

process.exit(survived.length > 0 || stale.length > 0 ? 1 : 0);
