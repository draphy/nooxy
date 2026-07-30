# Contributing to Nooxy

Thank you for your interest in contributing to Nooxy! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to uphold our Code of Conduct, which expects all contributors to be respectful and create a harassment-free experience for everyone.

## Contribution Workflow

We follow a structured workflow for all contributions. Here's the process:

### 1. Create an Issue

- Before making any changes, start by creating an issue in the [GitHub issue tracker](https://github.com/draphy/nooxy/issues)
- Clearly describe the bug, feature, or improvement you want to address
- Wait for a DRO issue number to be assigned in the comments

### 2. Branch Naming Convention

Create a branch with the following naming format:

```
username/dro-<issue-number>-<issue-title>
```

Example:

```
johndoe/dro-123-fix-url-rewriting
```

### 3. Fork and Clone the Repository

- Fork the repository to your GitHub account
- Clone your fork to your local machine
- Add the upstream repository as a remote

```bash
git clone https://github.com/yourusername/nooxy.git
cd nooxy
git remote add upstream https://github.com/draphy/nooxy.git
```

### 4. Set Up the Development Environment

Needs **Node 22+** (pinned in `.node-version`) and **pnpm** (`corepack enable`).
Windows, macOS and Linux all work. Chrome is optional — the browser tests skip
without it.

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Type check and lint
pnpm type:check
pnpm biome:check
```

### 5. Make Your Changes

- Create a new branch with the proper naming convention
- Make your changes following the coding conventions
- Write or update tests as needed
- Update documentation if necessary

### 6. Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear and meaningful commit messages.

Format:

```
<type>: [DRO-<issue-number>] <description>
```

Where `type` is one of:

- `feat`: A new feature
- `fix`: A bug fix
- `bug`: A bug fix (alternative to fix)
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `ci`: CI configuration changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks
- `revert`: Reverting changes
- `release`: Release-related changes

Example:

```
feat: [DRO-123] Add multi-instance config support
```

### 7. Pull Request Process

1. Push your changes to your fork — the pre-push hook runs the same checks CI will
   (see [Running the checks locally](#running-the-checks-locally))
2. Create a pull request against the main repository
3. Give the PR the same title format as the commit, capitalised after the bracket —
   `verify-pr.yml` rejects anything else
4. Provide a detailed description in the PR
5. Link the PR to the relevant issue
6. Ensure all status checks pass
7. Request a review from at least one maintainer

Pull requests require approval from at least one reviewer before they can be merged.

## Development Guidelines

Formatting and linting are [Biome](https://biomejs.dev/), configured in the repo —
`pnpm biome:fix` applies it. Write tests for new behaviour and update the docs when
behaviour changes.

## Running Examples

Cloudflare Workers example:

```bash
cd examples/cloudflare
pnpm install
pnpm run dev
```

## Local Testing Notes

After editing any files under `nooxy/` (head.js, body.js, head.css, header.html), run:

```bash
npx nooxy generate [--path=/custom/path]
```

## Running the checks locally

The git hooks in `.githooks/` are wired up automatically by `pnpm install` (via the
`prepare` script, which sets `core.hooksPath`). No hook manager is installed.

| Command | What it runs | When |
| --- | --- | --- |
| `pnpm commit:check` | lint, types, build, tests | what `pre-push` runs |
| `pnpm test` | the suite only | while iterating |
| `pnpm test:mutation` | breaks the source deliberately and checks a test notices | before a release |
| `pnpm check:generated` | builds, then fails if the build changed a committed file | what CI checks |
| `pnpm test:coverage` | the suite with line/branch coverage | when adding a module |

Coverage runs against `dist/`, because the tests exercise the built bundle on purpose.
Ignore the CLI's figure — `cli.test.mjs` runs it as a child process, which the
instrumenter cannot see.

`pre-commit` is lint + types only, so it stays fast. Both hooks inspect the
**working tree** rather than the index, so stash unrelated work-in-progress if it
blocks an otherwise clean commit. Use `--no-verify` to skip either once.

Biome handles JS, TS, JSON and CSS. It does **not** process Markdown, so `.md`
files are not auto-formatted and `pnpm biome:check` will not flag them — match the
surrounding style by hand.

### Generated files

`src/rewriters/custom/generated/*` is built from `head.js` and `head.css`. If you
edit either, run `pnpm build` and commit the regenerated output — CI rejects a PR
whose generated files do not match their own source.

## Branch protection (maintainers)

`.github/ruleset-required-checks.json` is **not applied automatically.** It is a
record of the intended ruleset, and has to be imported by hand:

**Settings → Rules → Rulesets → New ruleset → Import a ruleset.**

Checks are required **by name**, so a renamed job — or one gaining a matrix — must be
updated here in the same commit, or PRs wait on a check that never reports.

## Getting Help

If you need help with the contribution process or have questions, feel free to:

- Comment on the relevant issue
- Ask questions in pull requests
- Reach out to the maintainers

---

Thank you for contributing to Nooxy! Your efforts help make this project better for everyone.
