/**
 * Pulls the useful part out of a failed command's output.
 *
 * The tail is the right excerpt for a build error and the wrong one for a test
 * run. Node's runner emits TAP when stdout is not a TTY, so a failure is a
 * `not ok N - name` line partway through the stream and the tail lands on the
 * trailing counters instead. A real CI run reported `# fail 1` and named
 * nothing, which left a flaky test unidentifiable.
 *
 * So: the failing test names when there are any, the tail otherwise.
 *
 * Lives here rather than inside mutate.mjs so it can be tested. That script runs
 * its mutation loop at the top level, so importing it would apply mutations.
 */
export function excerpt(output, tail = 15) {
  const lines = (output ?? '').trim().split('\n');

  // Node writes TAP (`not ok 3 - name`) when piped on some versions and the
  // spec reporter (`✖ name`) on others, so both shapes have to be read. The
  // spec reporter also prints each failure twice, once inline and again under
  // a `✖ failing tests:` heading, which is why this dedupes and drops that
  // heading rather than reporting it as a test that failed.
  //
  // Deduping cannot merge two genuinely different failures: TAP numbers them,
  // and the spec reporter appends a duration. The counter lines are kept below
  // so the names shown can always be checked against the real total.
  const failures = [
    ...new Set(
      lines
        .map((line) => line.trim())
        .filter((line) => /^(?:not ok \d+|✖)/.test(line) && !/^✖ failing tests:/.test(line)),
    ),
  ];

  if (failures.length === 0) {
    return lines.slice(-tail).join('\n');
  }

  // `#` is TAP, `ℹ` is the spec reporter.
  const counts = lines.filter((line) => /^\s*[#ℹ] (?:tests|pass|fail) /.test(line)).map((line) => line.trim());
  const shown = failures.slice(0, 20);
  const elided = failures.length > shown.length ? [`... and ${failures.length - shown.length} more`] : [];

  return [...shown, ...elided, '', ...counts].join('\n');
}
