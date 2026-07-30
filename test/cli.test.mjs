// The CLI is what most users actually touch: `npx nooxy init` scaffolds a
// project and `npx nooxy generate` rebuilds the injected assets. It ships as the
// package's bin entry, so it is exercised here the way a user runs it — as a
// real child process in a throwaway directory.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/generated.mjs';

const CLI = path.join(ROOT, 'dist/cli/index.js');
const missingBuild = fs.existsSync(CLI) ? false : 'run `pnpm build` first';

// Skipping helps someone who forgot to build. In CI it is dangerous, because a
// skipped suite still reports green — so a pipeline that had quietly stopped
// exercising the CLI would look exactly like a passing one. harness.mjs does the
// same for dist/index.js, but it checks only that file, so a build where
// build:cli failed would leave this suite silently skipping.
if (missingBuild && process.env.CI) {
  throw new Error(`Refusing to report a pass without a built CLI: ${missingBuild}`);
}

const skip = missingBuild;

const SCAFFOLDED = ['config.js', 'head.js', 'body.js', 'head.css', 'header.html'];
const GENERATED = ['_head-js-string.js', '_body-js-string.js', '_head-css-string.js', '_header-html-string.js'];

const workspaces = [];

/** A throwaway project directory, cleaned up after the run. */
function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nooxy-cli-'));
  workspaces.push(dir);
  return dir;
}

/** Runs the CLI as a user would, returning its output and exit code. */
function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('nooxy init', { skip }, async (t) => {
  await t.test('scaffolds every template file', () => {
    const dir = workspace();
    const { code } = runCli(['init'], dir);
    assert.equal(code, 0);
    for (const file of SCAFFOLDED) {
      assert.ok(fs.existsSync(path.join(dir, 'nooxy', file)), `${file} was not created`);
    }
  });

  await t.test('also generates the assets config.js imports', () => {
    const dir = workspace();
    runCli(['init'], dir);
    for (const file of GENERATED) {
      assert.ok(fs.existsSync(path.join(dir, 'nooxy/generated', file)), `${file} was not generated`);
    }
  });

  await t.test('the scaffolded project loads as a real config', async () => {
    const dir = workspace();
    runCli(['init'], dir);
    // This is the whole point of init: config.js must import its generated
    // siblings and evaluate without the user editing anything first.
    // pathToFileURL, not `file://` + a path: on Windows the path contains
    // backslashes and a drive letter, which is not a valid module specifier.
    const { SITE_CONFIG } = await import(pathToFileURL(path.join(dir, 'nooxy/config.js')).href);
    assert.ok(SITE_CONFIG, 'config.js did not export SITE_CONFIG');
    for (const key of ['domain', 'slugToPage', 'siteName', 'notionDomain']) {
      assert.ok(key in SITE_CONFIG, `SITE_CONFIG is missing ${key}`);
    }
    for (const key of ['customHeadCSS', 'customHeadJS', 'customBodyJS', 'customHeader']) {
      assert.equal(typeof SITE_CONFIG[key], 'string', `${key} did not resolve to a string`);
    }
  });

  await t.test('does not overwrite files the user has edited', () => {
    const dir = workspace();
    runCli(['init'], dir);
    const configPath = path.join(dir, 'nooxy/config.js');
    fs.writeFileSync(configPath, '// my edits\n');

    const { stdout } = runCli(['init'], dir);
    assert.equal(fs.readFileSync(configPath, 'utf8'), '// my edits\n', 'init clobbered an edited file');
    assert.match(stdout, /already exists/);
  });
});

test('nooxy generate', { skip }, async (t) => {
  await t.test('rebuilds the assets after an edit', () => {
    const dir = workspace();
    runCli(['init'], dir);
    fs.writeFileSync(path.join(dir, 'nooxy/head.css'), '.marker { color : red }\n');

    const { code } = runCli(['generate'], dir);
    assert.equal(code, 0);
    const generated = fs.readFileSync(path.join(dir, 'nooxy/generated/_head-css-string.js'), 'utf8');
    assert.match(generated, /export const HEAD_CSS_STRING = `/);
    assert.ok(generated.includes('.marker{color:red}'), `edit was not picked up: ${generated}`);
  });

  await t.test('--no-minify keeps the source readable', () => {
    const dir = workspace();
    runCli(['init'], dir);
    fs.writeFileSync(path.join(dir, 'nooxy/head.css'), '.marker { color : red }\n');

    runCli(['generate', '--no-minify'], dir);
    const generated = fs.readFileSync(path.join(dir, 'nooxy/generated/_head-css-string.js'), 'utf8');
    assert.ok(generated.includes('.marker { color : red }'), 'output was minified despite --no-minify');
  });

  await t.test('--path targets another directory', () => {
    const project = workspace();
    runCli(['init'], project);
    const elsewhere = workspace();

    const { code } = runCli(['generate', `--path=${project}`], elsewhere);
    assert.equal(code, 0);
    assert.ok(fs.existsSync(path.join(project, 'nooxy/generated/_head-js-string.js')));
    assert.ok(!fs.existsSync(path.join(elsewhere, 'nooxy')), 'generate wrote into the wrong directory');
  });

  await t.test('--path tolerates quotes, as a shell would leave them', () => {
    const project = workspace();
    runCli(['init'], project);
    const { code } = runCli(['generate', `--path='${project}'`], workspace());
    assert.equal(code, 0);
    assert.ok(fs.existsSync(path.join(project, 'nooxy/generated/_head-css-string.js')));
  });

  await t.test('an unscaffolded directory is an error, not a silent success', () => {
    // This used to exit 0 while creating a stray nooxy/generated/ tree, so
    // running it one directory off — or with a typo'd --path — looked like the
    // changes had been applied.
    const dir = workspace();
    const { code, stdout, stderr } = runCli(['generate'], dir);
    assert.equal(code, 1, 'generate reported success without a nooxy/ folder');
    assert.match(`${stdout}${stderr}`, /No nooxy\/ folder/);
    assert.ok(!fs.existsSync(path.join(dir, 'nooxy')), 'created a stray nooxy/ folder in the wrong directory');
  });

  await t.test('a typo in --path does not build a directory tree', () => {
    const dir = workspace();
    const { code } = runCli(['generate', '--path=./typo'], dir);
    assert.equal(code, 1);
    assert.ok(!fs.existsSync(path.join(dir, 'typo')), 'a typo created ./typo/nooxy/generated/');
  });

  await t.test('a broken asset fails the command rather than shipping it', () => {
    const dir = workspace();
    runCli(['init'], dir);
    // An unterminated block comment would otherwise swallow the rest of the file.
    fs.writeFileSync(path.join(dir, 'nooxy/head.js'), 'var a = 1;\n/* never closed\nvar b = 2;\n');
    const { stdout, stderr } = runCli(['generate'], dir);
    assert.match(`${stdout}${stderr}`, /Error|❌/, 'a malformed asset was accepted silently');
  });
});

test('nooxy generate reports honestly', { skip }, async (t) => {
  await t.test('the optional source files really are optional', async () => {
    // The README documents head.css, head.js, body.js and header.html as optional,
    // but nooxy/config.js imports all four generated modules unconditionally. When
    // generate skipped a missing source, that import could not resolve and the site
    // failed to start with "Cannot find module" — so "optional" was not true.
    const dir = workspace();
    runCli(['init'], dir);

    for (const source of ['body.js', 'head.js', 'head.css', 'header.html']) {
      fs.rmSync(path.join(dir, 'nooxy', source));
    }
    fs.rmSync(path.join(dir, 'nooxy/generated'), { recursive: true, force: true });

    const { code, stdout } = runCli(['generate'], dir);
    assert.equal(code, 0, 'omitting every optional source should not be an error');
    assert.match(stdout, /not found/, 'the missing sources were not reported');

    for (const generated of GENERATED) {
      assert.ok(
        fs.existsSync(path.join(dir, 'nooxy/generated', generated)),
        `${generated} was not written, so config.js cannot import it`,
      );
    }

    // The real assertion: the config a worker imports must still load.
    const config = await import(pathToFileURL(path.join(dir, 'nooxy/config.js')).href);
    assert.ok(config.SITE_CONFIG, 'config.js did not export SITE_CONFIG');
    for (const field of ['customHeadCSS', 'customHeadJS', 'customBodyJS', 'customHeader']) {
      assert.equal(config.SITE_CONFIG[field], '', `${field} should be an empty string, not undefined`);
    }
  });

  await t.test('a deleted source clears its generated value rather than leaving it stale', async () => {
    const dir = workspace();
    runCli(['init'], dir);
    fs.writeFileSync(path.join(dir, 'nooxy/body.js'), 'window.marker = 1;');
    runCli(['generate'], dir);
    assert.match(fs.readFileSync(path.join(dir, 'nooxy/generated/_body-js-string.js'), 'utf8'), /marker/);

    fs.rmSync(path.join(dir, 'nooxy/body.js'));
    runCli(['generate'], dir);
    const after = fs.readFileSync(path.join(dir, 'nooxy/generated/_body-js-string.js'), 'utf8');
    assert.ok(!after.includes('marker'), `deleted body.js is still being injected:\n${after}`);
  });

  await t.test('does not claim to have generated a file that is missing', () => {
    const dir = workspace();
    runCli(['init'], dir);
    fs.rmSync(path.join(dir, 'nooxy/head.js'));
    const { stdout } = runCli(['generate'], dir);
    // The success line used to be printed regardless, contradicting the warning
    // immediately above it.
    assert.match(stdout, /not found/);
    assert.ok(
      !stdout.includes('✅ Generated') || !stdout.includes('_head-js-string'),
      `claimed success for a missing source:\n${stdout}`,
    );
  });

  await t.test('reports success only for assets it actually wrote', () => {
    const dir = workspace();
    runCli(['init'], dir);
    fs.rmSync(path.join(dir, 'nooxy/head.css'));
    const { stdout } = runCli(['generate'], dir);
    const generated = (stdout.match(/✅ Generated/g) ?? []).length;
    assert.equal(generated, 3, `expected three assets, got ${generated}:\n${stdout}`);
    assert.match(stdout, /CSS file not found/);
  });
});

test('nooxy option parsing', { skip }, async (t) => {
  await t.test('a mistyped option is refused rather than ignored', () => {
    const dir = workspace();
    runCli(['init'], dir);
    // '--no-minfy' used to be silently dropped, so the user got minified output
    // while believing they had turned minification off.
    const { code, stderr } = runCli(['generate', '--no-minfy'], dir);
    assert.equal(code, 1);
    assert.match(stderr, /Unrecognised option: --no-minfy/);
  });

  await t.test('an unknown option is refused', () => {
    const { code, stderr } = runCli(['generate', '--bogus'], workspace());
    assert.equal(code, 1);
    assert.match(stderr, /Unrecognised option/);
  });

  await t.test('valid options are still accepted together', () => {
    const project = workspace();
    runCli(['init'], project);
    const { code } = runCli(['generate', `--path=${project}`, '--no-minify'], workspace());
    assert.equal(code, 0);
  });
});

test('nooxy help', { skip }, async (t) => {
  for (const flag of ['--help', '-h', 'help']) {
    await t.test(`${flag} prints usage and succeeds`, () => {
      const { code, stdout } = runCli([flag], workspace());
      assert.equal(code, 0, 'asking for help is not an error');
      assert.match(stdout, /npx nooxy init/);
      assert.match(stdout, /--no-minify/);
    });
  }
});

test('nooxy version', { skip }, async (t) => {
  // The first thing anyone is asked for in a bug report.
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

  for (const flag of ['--version', '-v', 'version']) {
    await t.test(`${flag} prints the installed version`, () => {
      const { code, stdout } = runCli([flag], workspace());
      assert.equal(code, 0);
      assert.equal(stdout.trim(), expected, 'the version is read from the installed package.json');
    });
  }
});

test('nooxy init rejects options it cannot honour', { skip }, async (t) => {
  // init has no --path, so accepting one silently scaffolded into the current
  // directory instead — the same class of bug generate's parser already guards.
  await t.test('--path is refused rather than ignored', () => {
    const dir = workspace();
    const { code, stdout, stderr } = runCli(['init', '--path=./elsewhere'], dir);
    assert.equal(code, 1, 'init accepted an option it does not support');
    assert.match(`${stdout}${stderr}`, /init takes no options/);
    assert.ok(!fs.existsSync(path.join(dir, 'nooxy')), 'scaffolded anyway after refusing the option');
  });
});

test('nooxy with no recognised command', { skip }, async (t) => {
  await t.test('prints usage and exits non-zero', () => {
    const { code, stdout, stderr } = runCli(['nonsense'], workspace());
    assert.equal(code, 1);
    // The same USAGE block --help prints. A second, shorter copy used to live
    // here and had already drifted: it listed neither option.
    const output = `${stdout}${stderr}`;
    assert.match(output, /Unknown command: nonsense/);
    assert.match(output, /--path=<dir>/, 'the error path printed a usage text missing the options');
    assert.match(output, /--no-minify/);
  });

  await t.test('no command at all is also an error', () => {
    const { code } = runCli([], workspace());
    assert.equal(code, 1);
  });
});

test.after(() => {
  for (const dir of workspaces) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A template missing from the installed package is a packaging fault the user
// cannot fix by rerunning. init used to print "initialized successfully" and exit
// 0 regardless, which is the first command a new user runs.
test('nooxy init with an incomplete package', { skip }, async (t) => {
  /** A copy of the built CLI with one template removed. */
  const brokenCli = () => {
    const dir = workspace();
    fs.cpSync(path.join(ROOT, 'dist/cli'), path.join(dir, 'cli'), { recursive: true });
    fs.rmSync(path.join(dir, 'cli/templates/head.css'));
    return path.join(dir, 'cli/index.js');
  };

  const runBroken = (args, cwd) => {
    try {
      return {
        code: 0,
        stdout: execFileSync(process.execPath, [brokenCli(), ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }),
      };
    } catch (error) {
      return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
  };

  await t.test('exits non-zero instead of claiming success', () => {
    const { code } = runBroken(['init'], workspace());
    assert.equal(code, 1, 'a missing template was reported as success');
  });

  await t.test('does not print the success banner', () => {
    const { stdout } = runBroken(['init'], workspace());
    assert.ok(!stdout.includes('initialized successfully'), `claimed success:\n${stdout}`);
  });

  await t.test('says which file failed and why', () => {
    const { stdout, stderr } = runBroken(['init'], workspace());
    const output = `${stdout}${stderr}`;
    assert.match(output, /head\.css/);
    assert.match(output, /reinstall/i);
  });

  await t.test('the templates it could copy are still written', () => {
    const dir = workspace();
    runBroken(['init'], dir);
    assert.ok(fs.existsSync(path.join(dir, 'nooxy/config.js')), 'one failure aborted the rest');
  });
});
