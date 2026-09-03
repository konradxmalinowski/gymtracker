/**
 * RFC 4180 CSV encode/decode - pure string functions, no file I/O (the
 * service layer owns writing the result to disk and reading it back, per
 * ADR-0013's CSV section). `\r\n` line endings and a UTF-8 BOM prefix are
 * both non-negotiable per the ADR: "the BOM is what makes Excel open Polish
 * exercise names correctly instead of as mojibake, and its absence is the
 * single most common complaint about CSV exports."
 */

/** UTF-8 byte-order mark, as the single JS string character it decodes to. */
const BOM = '﻿';

/**
 * Encodes rows of already-string fields into one RFC 4180 CSV document,
 * BOM-prefixed, `\r\n`-terminated (including after the final row, matching
 * how most real-world CSV files and Excel's own exporter both end a file).
 * A field is quoted only when it contains a comma, double quote, or newline
 * - RFC 4180 requires quoting in those cases and permits it everywhere else,
 * so this only quotes where required to keep output smaller and closer to
 * what a human skimming the raw file expects.
 */
export function encodeCsv(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return BOM;
  }
  const lines = rows.map((row) => row.map(encodeCsvField).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

function encodeCsvField(value: string): string {
  // Formula-injection guard: a field whose exact first character is one of
  // `= + - @` opens as a formula in Excel/Google Sheets rather than
  // displaying as text. Prefixing with a leading apostrophe is the standard
  // mitigation - both applications treat it as "force text" and never show
  // it in the rendered cell - applied before the RFC 4180 quoting below so a
  // field needing both (e.g. `=SUM(A1),1`) gets escaped correctly by it too.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * Decodes an RFC 4180 CSV document into rows of fields, BOM-tolerant (a
 * leading BOM is stripped if present; its absence is not an error, so this
 * also reads a plain UTF-8 CSV a user edited in a BOM-stripping tool). A
 * quoted field may contain commas, (`\r\n` or bare `\n`) newlines, and an
 * escaped `""` for a literal quote - the full RFC 4180 grammar, not just the
 * common case this app's own encoder happens to produce.
 *
 * A trailing empty line (the common "file ends with a newline" case, which
 * `encodeCsv` itself always produces) does not become a spurious empty final
 * row.
 */
export function decodeCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  if (input.length === 0) {
    return [];
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyFieldOnThisLine = false;
  let index = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    sawAnyFieldOnThisLine = false;
  };

  while (index < input.length) {
    const char = input[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnyFieldOnThisLine = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      sawAnyFieldOnThisLine = true;
      endField();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      const consumedTwo = char === '\r' && input[index + 1] === '\n';
      // A bare newline with nothing accumulated and no row started yet is a
      // blank line between records, not an empty row - skip it rather than
      // emitting a spurious `['']` row (this is what makes a trailing
      // newline at end-of-file a non-event instead of one extra row).
      if (!sawAnyFieldOnThisLine && field.length === 0 && row.length === 0) {
        index += consumedTwo ? 2 : 1;
        continue;
      }
      endRow();
      index += consumedTwo ? 2 : 1;
      continue;
    }

    field += char;
    sawAnyFieldOnThisLine = true;
    index += 1;
  }

  // A final line with no trailing newline still needs its field/row flushed.
  if (sawAnyFieldOnThisLine || field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}
