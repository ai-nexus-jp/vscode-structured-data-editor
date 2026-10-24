import { UnsupportedTableError } from "../core/errors";
import type { Alignment, TableData } from "../core/model";
import { serializeCsv } from "./csv/csv";
import { ABSENT, parseCell } from "./json/json";
import { serializeTable } from "./markdown/serializer";

export type Format = "markdown" | "csv" | "json";

export const FORMAT_EXTENSION: Record<Format, string> = { markdown: "md", csv: "csv", json: "json" };

export interface ExportResult {
  content: string;
  /** Human-readable descriptions of information that will be lost or changed. */
  warnings: string[];
}

/** Convert JSON-editor cell text to plain text (and report what is lost). */
function jsonCellsToText(data: TableData, warnings: string[]): TableData {
  let missing = false;
  let typed = false;
  let nested = false;
  const rows = data.rows.map((row) =>
    row.map((cell) => {
      let v: unknown;
      try {
        v = parseCell(cell);
      } catch {
        return cell;
      }
      if (v === ABSENT) {
        missing = true;
        return "";
      }
      if (typeof v === "string") return v;
      if (typeof v === "object" && v !== null) nested = true;
      else typed = true;
      return JSON.stringify(v);
    }),
  );
  if (missing) warnings.push("Missing JSON keys (and empty strings) become indistinguishable empty cells.");
  if (typed) warnings.push("JSON numbers, booleans and null become plain text; their types are lost.");
  if (nested) warnings.push("Nested objects/arrays become JSON text inside a single cell.");
  return { ...data, rows };
}

function inferValue(text: string): unknown {
  if (text === "") return "";
  try {
    const v = parseCell(text);
    return v === ABSENT ? "" : v;
  } catch {
    return text;
  }
}

/**
 * Convert an in-memory table from one format to serialized text of another.
 * Throws UnsupportedTableError when the target cannot represent the table.
 */
export function exportTable(data: TableData, from: Format, to: Format): ExportResult {
  if (from === to) throw new UnsupportedTableError("Source and target formats are the same.");
  const warnings: string[] = [];
  let table = data;
  if (from === "json") table = jsonCellsToText(data, warnings);

  switch (to) {
    case "markdown": {
      if (table.rows.some((r) => r.some((c) => /[\r\n]/.test(c)))) {
        warnings.push("Line breaks inside cells are converted to <br>.");
      }
      return {
        content: serializeTable(table) + "\n",
        warnings,
      };
    }
    case "csv": {
      if (table.alignments.some((a) => a !== "none")) warnings.push("Column alignment is not representable in CSV and is dropped.");
      const plain: TableData = { ...table, alignments: table.headers.map((): Alignment => "none") };
      return {
        content: serializeCsv(plain, { delimiter: ",", eol: "\n", trailingNewline: true }),
        warnings,
      };
    }
    case "json": {
      if (from !== "markdown" && from !== "csv") throw new UnsupportedTableError("Unsupported source format.");
      if (table.alignments.some((a) => a !== "none")) warnings.push("Column alignment is not representable in JSON and is dropped.");
      warnings.push(
        "Cell text is converted to JSON types: numbers, true/false/null become typed values; other text stays a string (e.g. 01234 stays text).",
      );
      // Reuse the JSON serializer's key validation by building rows of already-typed values.
      const seen = new Set<string>();
      for (const h of table.headers) {
        if (h.trim() === "") throw new UnsupportedTableError("JSON needs non-empty column names, but a header is empty.");
        if (seen.has(h)) throw new UnsupportedTableError(`JSON needs unique column names, but "${h}" is duplicated.`);
        seen.add(h);
      }
      const objects = table.rows.map((row) =>
        Object.fromEntries(row.map((c, i) => [table.headers[i]!, inferValue(c)] as [string, unknown])),
      );
      return { content: JSON.stringify(objects, null, 2) + "\n", warnings };
    }
  }
}
