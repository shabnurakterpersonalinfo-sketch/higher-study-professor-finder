/**
 * Minimal RFC 4180 CSV reader: quoted fields, "" escapes, commas/newlines
 * inside quotes, CRLF. Rows must have exactly as many cells as the header —
 * a mismatch throws with the line number instead of silently shifting columns
 * (which is how the original export lost data next to removed links).
 */
export interface CsvTable {
  header: string[];
  rows: { line: number; record: Record<string, string>; error?: string }[];
}

export function parseCsv(text: string, source = 'csv'): Record<string, string>[] {
  return parseCsvTable(text, source).rows.map((r) => r.record);
}

/** Like parseCsv, but keeps the header and each row's 1-based source line (for error reports). */
export function parseCsvTable(text: string, source = 'csv', opts: { lenient?: boolean } = {}): CsvTable {
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else {
        if (c === '\n') line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') cells.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      cells.push(cell);
      if (cells.some((x) => x !== '') || cells.length > 1) rows.push({ cells, line: rowLine });
      cells = [];
      cell = '';
      line++;
      rowLine = line;
    } else cell += c;
  }
  if (quoted) throw new Error(`${source}: unterminated quote starting near line ${rowLine}`);
  if (cell !== '' || cells.length) {
    cells.push(cell);
    rows.push({ cells, line: rowLine });
  }
  if (!rows.length) return { header: [], rows: [] };

  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  return {
    header,
    rows: rows.slice(1).map(({ cells: r, line: l }) => {
      if (r.length !== header.length) {
        const msg = `line ${l} has ${r.length} cells, header has ${header.length}`;
        // Lenient (uploads): report the row and keep going. Strict (seed): fail the file.
        if (opts.lenient) return { line: l, record: {}, error: `${msg} — check for unquoted commas` };
        throw new Error(`${source}: ${msg}`);
      }
      return { line: l, record: Object.fromEntries(header.map((h, i) => [h, r[i]])) };
    }),
  };
}
