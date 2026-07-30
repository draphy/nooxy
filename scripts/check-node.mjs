// Refuses to run the suite on a Node that cannot support it, and says why.
//
// Without this, Node below 22 fails with a ReferenceError or an empty test run —
// neither of which names the real problem. Wired up as the `pretest` script, so it
// runs ahead of every `pnpm test`.

const REQUIRED_MAJOR = 22;
const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

if (major < REQUIRED_MAJOR) {
  console.error(`
  nooxy needs Node ${REQUIRED_MAJOR} or newer. You have v${process.versions.node}.

  .node-version pins the right version, so \`fnm use\`, \`nvm use\` or \`asdf install\`
  will switch for you.
`);
  process.exit(1);
}
