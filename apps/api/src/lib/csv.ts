/**
 * One CSV cell: quoted, quotes doubled, and neutralized against spreadsheet
 * formula injection (values from received mail start with =, +, -, @ etc.).
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
