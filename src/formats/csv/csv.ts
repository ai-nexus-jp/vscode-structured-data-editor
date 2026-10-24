import { UnsupportedTableError } from "../../core/errors";
import type { TableData } from "../../core/model";

export interface CsvMeta {
  delimiter: string;
  eol: "\n" | "\r\n";
  /** Whether the source ended with a line break. */
  trailingNewline: boolean;
}

export interface ParsedCsv {
  data: TableData;
  meta: CsvMeta;
}

const DELIMITERS = [",", "\t", ";", "|"];

/** Choose a delimiter from the extension, else by counting candidates in the first line. */
export function detectDelimiter(text: string, fileName = ""): string {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (const ch of first) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse RFC 4180-style CSV. The first record is the header.
 * Throws UnsupportedTableError for empty input, malformed quoting, or ragged rows
 * (nothing is silently truncated or padded).
 */
export function parseCsv(text: string, delimiter: string): ParsedCsv {
  if (text.trim() === "") throw new UnsupportedTableError("The file is empty.");
  const eol: "\n" | "\r\n" = /\r\n/.test(text) && text.indexOf("\r\n") <= (text.indexOf("\n") ?? 0) ? "\r\n" : "\n";
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let i = 0;
  let line = 1;
  let atRecordStart = true;

  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = "";
    atRecordStart = true;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' && field === "" && (atRecordStart || text[i - 1] === delimiter || isEol(text[i - 1]))) {
      // quoted field
      atRecordStart = false;
      i++;
      let closed = false;
      while (i < text.length) {
        const c = text[i]!;
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        if (c === "\n") line++;
        field += c;
        i++;
      }
      if (!closed) throw new UnsupportedTableError("Unterminated quoted field.");
      const next = text[i];
      if (next !== undefined && next !== delimiter && next !== "\n" && next !== "\r") {
        throw new UnsupportedTableError(`Unexpected character after closing quote on line ${line}.`);
      }
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = "";
      atRecordStart = false;
      i++;
    } else if (ch === "\r" || ch === "\n") {
      endRecord();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      line++;
    } else {
      field += ch;
      atRecordStart = false;
      i++;
    }
  }
  const trailingNewline = isEol(text[text.length - 1]);
  if (!trailingNewline) endRecord();

  const [headers, ...rows] = records as [string[], ...string[][]];
  const cols = headers.length;
  records.forEach((r, n) => {
    if (r.length !== cols) {
      throw new UnsupportedTableError(
        `Record ${n + 1} has ${r.length} fields but the header has ${cols}. Fix the column counts first.`,
      );
    }
  });
  return {
    data: { headers, alignments: headers.map(() => "none"), rows },
    meta: { delimiter, eol, trailingNewline },
  };
}

function isEol(c: string | undefined): boolean {
  return c === "\n" || c === "\r";
}

function quote(value: string, delimiter: string, single: boolean): string {
  const needs =
    value.includes(delimiter) || /["\r\n]/.test(value) || (single && value === "") || /^\s|\s$/.test(value);
  return needs ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeCsv(data: TableData, meta: CsvMeta): string {
  const single = data.headers.length === 1;
  const out = [data.headers, ...data.rows].map((r) =>
    r.map((v) => quote(v, meta.delimiter, single)).join(meta.delimiter),
  );
  return out.join(meta.eol) + (meta.trailingNewline ? meta.eol : "");
}
