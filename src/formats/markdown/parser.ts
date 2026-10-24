import type { Alignment, TableData } from "../../core/model";
import type { MarkdownTable, TableLookup } from "./types";

const DELIM_CELL = /^:?-+:?$/;

/** Split a document into lines (without EOLs). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** Split a row into raw cells, honoring `\|` escapes. Returns unescaped cells. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  // Trailing pipe counts only if not escaped.
  if (s.endsWith("|") && !endsWithEscapedPipe(s)) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function endsWithEscapedPipe(s: string): boolean {
  let backslashes = 0;
  for (let i = s.length - 2; i >= 0 && s[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => DELIM_CELL.test(c));
}

function parseAlignment(cell: string): Alignment {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  if (l && r) return "center";
  if (l) return "left";
  if (r) return "right";
  return "none";
}

/** Returns, per line, whether it lies inside a fenced code block (fences included). */
export function fencedLineMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of lines) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      mask.push(true);
      if (m && m[1]![0] === fence.char && m[1]!.length >= fence.len && m[2]!.trim() === "") {
        fence = null;
      }
    } else if (m && !(m[1]![0] === "`" && m[2]!.includes("`"))) {
      fence = { char: m[1]![0]!, len: m[1]!.length };
      mask.push(true);
    } else {
      mask.push(false);
    }
  }
  return mask;
}

function indentOf(line: string): number {
  return /^ */.exec(line)![0].length;
}

/**
 * Find the table containing `line` (0-based) in `text`.
 * Returns "unsupported" with a reason when the table cannot be edited safely.
 */
export function findTableAtLine(text: string, line: number): TableLookup {
  const eol: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitLines(text);
  if (line < 0 || line >= lines.length) return { kind: "none" };
  const fenced = fencedLineMask(lines);

  // Candidate table starts: a header line followed by a delimiter row.
  let i = 0;
  while (i < lines.length) {
    if (fenced[i] || !isTableStart(lines, fenced, i)) {
      i++;
      continue;
    }
    let end = i + 2;
    while (end < lines.length && !fenced[end] && isBodyRow(lines[end]!)) end++;
    end--; // inclusive
    if (line >= i && line <= end) return buildTable(lines, i, end, eol);
    i = end + 1;
  }
  return { kind: "none" };
}

function isTableStart(lines: string[], fenced: boolean[], i: number): boolean {
  const header = lines[i]!;
  const delim = lines[i + 1];
  if (delim === undefined || fenced[i + 1]) return false;
  if (!header.includes("|") || header.trim().startsWith(">") || indentOf(header) > 3) return false;
  return isDelimiterRow(delim);
}

function isBodyRow(line: string): boolean {
  return line.trim() !== "" && line.includes("|");
}

function buildTable(lines: string[], start: number, end: number, eol: "\n" | "\r\n"): TableLookup {
  const headerLine = lines[start]!;
  const indent = " ".repeat(indentOf(headerLine));
  const headers = splitRow(headerLine);
  const delimCells = splitRow(lines[start + 1]!);
  if (headers.length !== delimCells.length) {
    return {
      kind: "unsupported",
      reason: `Header has ${headers.length} columns but the delimiter row has ${delimCells.length}.`,
    };
  }
  const rows: string[][] = [];
  for (let n = start + 2; n <= end; n++) {
    const cells = splitRow(lines[n]!);
    if (cells.length !== headers.length) {
      return {
        kind: "unsupported",
        reason: `Line ${n + 1} has ${cells.length} cells but the table has ${headers.length} columns.`,
      };
    }
    rows.push(cells);
  }
  const data: TableData = { headers, alignments: delimCells.map(parseAlignment), rows };
  const table: MarkdownTable = {
    data,
    startLine: start,
    endLine: end,
    sourceText: lines.slice(start, end + 1).join(eol),
    indent,
    eol,
  };
  return { kind: "found", table };
}
