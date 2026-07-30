## What this changes

<!-- Short. Bullets are fine. -->

Closes #

## How it was verified

<!-- Commands you ran, or what you clicked. If you added no tests, say why. -->

## Checklist

- [ ] Title is `<type>: [DRO-<number>] <Description>`, which `verify-pr.yml` enforces
- [ ] `pnpm commit:check` passes
- [ ] Rebuilt and committed `src/rewriters/custom/generated/`, if `head.js`, `head.css` or `header.html` changed
- [ ] No new runtime dependency
- [ ] Docs updated, if behaviour changed
