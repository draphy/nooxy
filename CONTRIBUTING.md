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

0. Before pushing, run the full local check to ensure CI will pass:

   ```bash
   pnpm commit:check
   ```

1. Push your changes to your fork
2. Create a pull request against the main repository
3. Use this format for the PR title:
   ```
   <type>: [DRO-<issue-number>] <Title starting with capital letter>
   ```
   Example:
   ```
   feat: [DRO-123] Add multi-instance config support
   ```
4. Provide a detailed description in the PR
5. Link the PR to the relevant issue
6. Ensure all status checks pass
7. Request a review from at least one maintainer

Pull requests require approval from at least one reviewer before they can be merged.

### 8. Code Quality Tools

Before submitting your PR, ensure your code passes all checks by running:

```bash
# Format and lint with Biome
pnpm biome:format
pnpm biome:lint

# Run type checking
pnpm type:check

# Run all checks and build (recommended before commit)
pnpm commit:check
```

## Development Guidelines

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. Our code style is enforced by the configuration in the repository.

### Testing

- Write tests for new features and bug fixes
- Maintain or improve test coverage
- Run tests locally before submitting a PR

### Documentation

- Update documentation to reflect any changes
- Use clear and concise language
- Follow the existing documentation style

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

## Getting Help

If you need help with the contribution process or have questions, feel free to:

- Comment on the relevant issue
- Ask questions in pull requests
- Reach out to the maintainers

---

Thank you for contributing to Nooxy! Your efforts help make this project better for everyone.
