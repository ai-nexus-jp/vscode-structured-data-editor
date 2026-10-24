import type { Alignment, TableData } from "../../core/model";

/** Terminal display width: East Asian wide/fullwidth characters count as 2. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd);
    const zero = c >= 0x300 && c <= 0x36f;
    w += zero ? 0 : wide ? 2 : 1;
  }
  return w;
}

export function escapeCell(cell: string): string {
  return cell.replace(/\r\n|\r|\n/g, "<br>").replace(/\|/g, "\\|");
}

function pad(s: string, width: number, align: Alignment): string {
  const gap = Math.max(0, width - displayWidth(s));
  if (align === "right") return " ".repeat(gap) + s;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + s + " ".repeat(gap - left);
  }
  return s + " ".repeat(gap);
}

function delimiter(align: Alignment, width: number): string {
  switch (align) {
    case "left":
      return ":" + "-".repeat(width - 1);
    case "right":
      return "-".repeat(width - 1) + ":";
    case "center":
      return ":" + "-".repeat(width - 2) + ":";
    default:
      return "-".repeat(width);
  }
}

/** Serialize to an aligned GFM table. No trailing EOL. */
export function serializeTable(
  data: TableData,
  opts: { indent?: string; eol?: "\n" | "\r\n" } = {},
): string {
  const indent = opts.indent ?? "";
  const eol = opts.eol ?? "\n";
  const cols = data.headers.length;
  const head = data.headers.map(escapeCell);
  const body = data.rows.map((r) => r.map(escapeCell));
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    const align = data.alignments[c] ?? "none";
    const min = align === "center" ? 5 : 3;
    widths.push(Math.max(min, displayWidth(head[c]!), ...body.map((r) => displayWidth(r[c] ?? ""))));
  }
  const fmt = (cells: string[]) =>
    indent + "| " + cells.map((s, c) => pad(s, widths[c]!, data.alignments[c] ?? "none")).join(" | ") + " |";
  const lines = [
    fmt(head),
    indent + "| " + widths.map((w, c) => delimiter(data.alignments[c] ?? "none", w)).join(" | ") + " |",
    ...body.map((r) => fmt(Array.from({ length: cols }, (_, c) => r[c] ?? ""))),
  ];
  return lines.join(eol);
}
