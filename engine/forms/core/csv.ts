// CSV with the boring details right: RFC 4180 quoting, CRLF line ends, a UTF-8
// BOM so Excel opens emoji and accents correctly, and a guard against formula
// injection (a cell starting with = + - @ is prefixed with a quote).

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',') + '\r\n'
}

export const CSV_BOM = '﻿'
