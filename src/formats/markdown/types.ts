import type { TableData } from "../../core/model";

/** A Markdown table located in a document, with its exact source range. */
export interface MarkdownTable {
  data: TableData;
  /** 0-based first line (header row). */
  startLine: number;
  /** 0-based last line (inclusive). */
  endLine: number;
  /** Original source text of lines startLine..endLine, without trailing EOL. */
  sourceText: string;
  /** Leading indentation (0-3 spaces) shared by all rows. */
  indent: string;
  /** Line ending used inside the table. */
  eol: "\n" | "\r\n";
}

export type TableLookup =
  | { kind: "found"; table: MarkdownTable }
  | { kind: "none" }
  | { kind: "unsupported"; reason: string };
