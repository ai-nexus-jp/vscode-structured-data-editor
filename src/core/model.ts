export type Alignment = "none" | "left" | "center" | "right";

/** Format-neutral editable grid. Cells are plain strings (unescaped). */
export interface TableData {
  headers: string[];
  alignments: Alignment[];
  rows: string[][];
}
