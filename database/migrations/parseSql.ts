/**
 * Splits a multi-statement SQL script into individual statements.
 *
 * Deliberately simple: strips `--` line comments, then splits on `;`. This is safe
 * for `database/schema.sql` (no semicolons or `--` sequences ever appear inside a
 * string literal there - verified by the sync test in
 * `__tests__/database/schema.test.ts`) but is not a general-purpose SQL parser and
 * must not be reused against arbitrary/untrusted SQL text.
 */
export function parseSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const commentIndex = line.indexOf('--');
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
