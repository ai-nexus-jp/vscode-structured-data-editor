import { UnsupportedTableError } from "../../core/errors";
import type { TableData } from "../../core/model";

/**
 * Cell text <-> JSON value mapping (lossless, identity-free):
 *  - ""                         -> key absent
 *  - true / false / null / number literal -> that JSON value
 *  - "..." (valid JSON string)  -> that string  (used to disambiguate strings like "123")
 *  - {...} / [...] (valid JSON) -> nested value, shown as compact JSON
 *  - anything else              -> the raw text as a string
 * Strings that would otherwise be misread are displayed JSON-quoted.
 */
export interface JsonMeta {
  indent: string | number;
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
}

export const ABSENT = Symbol("absent");
type Cell = unknown | typeof ABSENT;

/** Interpret edited cell text. Throws UnsupportedTableError for malformed `{`/`[`/`"` text. */
export function parseCell(text: string): Cell {
  if (text === "") return ABSENT;
  const t = text.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?\d/.test(t)) {
    try {
      const v: unknown = JSON.parse(t);
      if (typeof v === "number") return v;
    } catch {
      /* not a number literal: plain text */
    }
    return text;
  }
  if (/^["{[]/.test(t)) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      throw new UnsupportedTableError(
        `Cell text "${truncate(text)}" looks like JSON but is invalid. Fix it, or wrap plain text in double quotes.`,
      );
    }
  }
  return text;
}

function truncate(s: string): string {
  return s.length > 30 ? s.slice(0, 30) + "…" : s;
}

/** Text shown in the grid for a value. */
export function displayCell(value: unknown): string {
  if (typeof value === "string") {
    let same = false;
    try {
      same = parseCell(value) === value;
    } catch {
      same = false;
    }
    return same ? value : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/** Indent unit = leading whitespace of the first nested line (the array's direct children). */
function detectIndent(text: string): string | number {
  const second = text.split(/\r?\n/)[1];
  const m = second === undefined ? null : /^[ \t]+/.exec(second);
  if (!m) return 2;
  return m[0].startsWith("\t") ? "\t" : m[0].length;
}

export function parseJsonTable(text: string): { data: TableData; meta: JsonMeta } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new UnsupportedTableError(`Invalid JSON (${(e as Error).message}).`);
  }
  if (!Array.isArray(value)) {
    throw new UnsupportedTableError("Only a top-level array of objects can be edited as a table.");
  }
  if (value.length === 0) throw new UnsupportedTableError("The array is empty, so there are no columns.");
  const keys: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, n) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new UnsupportedTableError(`Item ${n + 1} is not an object.`);
    }
    for (const k of Object.keys(item)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  });
  if (keys.length === 0) throw new UnsupportedTableError("The objects have no keys.");
  if (keys.includes("")) throw new UnsupportedTableError("Empty-string keys are not supported.");
  const rows = (value as Record<string, unknown>[]).map((o) =>
    keys.map((k) => (Object.prototype.hasOwnProperty.call(o, k) ? displayCell(o[k]) : "")),
  );
  return {
    data: { headers: keys, alignments: keys.map(() => "none"), rows },
    meta: {
      indent: detectIndent(text),
      eol: text.includes("\r\n") ? "\r\n" : "\n",
      trailingNewline: /\n$/.test(text),
    },
  };
}

export function serializeJsonTable(data: TableData, meta: JsonMeta): string {
  const seen = new Set<string>();
  for (const h of data.headers) {
    if (h.trim() === "") throw new UnsupportedTableError("Column names (JSON keys) must not be empty.");
    if (seen.has(h)) throw new UnsupportedTableError(`Duplicate column name "${h}".`);
    seen.add(h);
  }
  const objects = data.rows.map((row) => {
    const entries: [string, unknown][] = [];
    row.forEach((text, c) => {
      const v = parseCell(text);
      if (v !== ABSENT) entries.push([data.headers[c]!, v]);
    });
    return Object.fromEntries(entries);
  });
  let out = JSON.stringify(objects, null, meta.indent);
  if (meta.eol === "\r\n") out = out.replace(/\n/g, "\r\n");
  return out + (meta.trailingNewline ? meta.eol : "");
}
