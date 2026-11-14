/**
 * RFC 4180 writer with formula-injection protection (MASTER_PLAN N11).
 * Pure string functions: safe to run in the browser.
 */

/** First characters that spreadsheet programs treat as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Prefixes cells that start with `= + - @ TAB CR` with an apostrophe, so that Excel, Sheets and
 * LibreOffice show the text instead of running it. Apply to every text cell.
 */
export function neutraliseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** One CSV field: formula-neutralised, then quoted when it holds a comma, quote, CR or LF. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : neutraliseFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_NEWLINE = '\r\n';

export type CsvValue = string | number | null | undefined;

export function csvRow(cells: readonly CsvValue[]): string {
  return cells.map(csvCell).join(',');
}

/** Rows joined with CRLF and a closing CRLF, as RFC 4180 describes. */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map(csvRow).join(CSV_NEWLINE) + CSV_NEWLINE;
}
