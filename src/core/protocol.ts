import type { Alignment, TableData } from "./model";

export type WebviewToHost =
  | { type: "ready" }
  | { type: "apply"; table: TableData }
  | { type: "cancel" };

export type HostToWebview =
  | { type: "init"; table: TableData; format: "markdown" | "csv" | "json" }
  | { type: "conflict"; message: string }
  | { type: "error"; message: string };

const MAX_ROWS = 10000;
const MAX_COLS = 500;
const MAX_CELL = 100000;
const ALIGNMENTS: readonly string[] = ["none", "left", "center", "right"];

function isStringArray(v: unknown, max: number): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every((s) => typeof s === "string" && s.length <= MAX_CELL)
  );
}

/** Validate an untrusted value as TableData. Returns null if invalid. */
export function validateTableData(v: unknown): TableData | null {
  if (typeof v !== "object" || v === null) return null;
  const t = v as Record<string, unknown>;
  if (!isStringArray(t.headers, MAX_COLS) || t.headers.length === 0) return null;
  const cols = t.headers.length;
  if (!Array.isArray(t.alignments) || t.alignments.length !== cols) return null;
  if (!t.alignments.every((a) => typeof a === "string" && ALIGNMENTS.includes(a))) return null;
  if (!Array.isArray(t.rows) || t.rows.length > MAX_ROWS) return null;
  for (const r of t.rows) {
    if (!isStringArray(r, MAX_COLS) || r.length !== cols) return null;
  }
  return {
    headers: t.headers,
    alignments: t.alignments as Alignment[],
    rows: t.rows as string[][],
  };
}

/** Validate an untrusted webview message. Returns null if invalid. */
export function validateWebviewMessage(v: unknown): WebviewToHost | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case "ready":
      return { type: "ready" };
    case "cancel":
      return { type: "cancel" };
    case "apply": {
      const table = validateTableData(m.table);
      return table ? { type: "apply", table } : null;
    }
    default:
      return null;
  }
}
