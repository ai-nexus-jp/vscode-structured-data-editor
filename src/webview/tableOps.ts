import type { TableData } from "../core/model";

export type SortDirection = "asc" | "desc";

export interface TableSnapshot {
  table: TableData;
  colWidths: number[];
}

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function cloneTableData(table: TableData): TableData {
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.map((r) => [...r]),
  };
}

function compareCellValues(a: string, b: string, direction: SortDirection): number {
  const aTrim = a.trim();
  const bTrim = b.trim();
  const aEmpty = aTrim === "";
  const bEmpty = bTrim === "";

  // Always keep empty cells at the bottom regardless of sort direction.
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let cmp: number;
  if (NUMERIC_RE.test(aTrim) && NUMERIC_RE.test(bTrim)) {
    const aNum = Number(aTrim);
    const bNum = Number(bTrim);
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
      cmp = aNum - bNum;
    } else {
      cmp = aTrim.localeCompare(bTrim, undefined, { numeric: true, sensitivity: "base" });
    }
  } else {
    cmp = aTrim.localeCompare(bTrim, undefined, { numeric: true, sensitivity: "base" });
    if (cmp === 0) {
      cmp = aTrim.localeCompare(bTrim);
    }
  }

  return direction === "asc" ? cmp : -cmp;
}

/** Return a new TableData with rows sorted by the specified column. */
export function sortRowsByColumn(
  table: TableData,
  colIndex: number,
  direction: SortDirection,
): TableData {
  const next = cloneTableData(table);
  if (colIndex < 0 || colIndex >= next.headers.length) return next;
  next.rows.sort((rowA, rowB) =>
    compareCellValues(rowA[colIndex] ?? "", rowB[colIndex] ?? "", direction),
  );
  return next;
}

/** Move a row from fromIndex to toIndex, returning a new TableData. */
export function moveRow(table: TableData, fromIndex: number, toIndex: number): TableData {
  const next = cloneTableData(table);
  if (
    fromIndex < 0 ||
    fromIndex >= next.rows.length ||
    toIndex < 0 ||
    toIndex >= next.rows.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = next.rows.splice(fromIndex, 1);
  if (moved) {
    next.rows.splice(toIndex, 0, moved);
  }
  return next;
}

/** Move a column (header, alignment, cells, and optional colWidths) from fromIndex to toIndex. */
export function moveColumn(
  table: TableData,
  fromIndex: number,
  toIndex: number,
  colWidths: number[] = [],
): TableSnapshot {
  const next = cloneTableData(table);
  const nextWidths = [...colWidths];
  const colCount = next.headers.length;

  if (
    fromIndex < 0 ||
    fromIndex >= colCount ||
    toIndex < 0 ||
    toIndex >= colCount ||
    fromIndex === toIndex
  ) {
    return { table: next, colWidths: nextWidths };
  }

  const [header] = next.headers.splice(fromIndex, 1);
  const [alignment] = next.alignments.splice(fromIndex, 1);
  if (header !== undefined) next.headers.splice(toIndex, 0, header);
  if (alignment !== undefined) next.alignments.splice(toIndex, 0, alignment);

  for (const row of next.rows) {
    const [cell] = row.splice(fromIndex, 1);
    if (cell !== undefined) row.splice(toIndex, 0, cell);
  }

  if (fromIndex < nextWidths.length && toIndex <= nextWidths.length) {
    const [w] = nextWidths.splice(fromIndex, 1);
    if (w !== undefined) nextWidths.splice(toIndex, 0, w);
  }

  return { table: next, colWidths: nextWidths };
}

/** Delete all rows whose 0-based index is in selectedIndices. */
export function deleteRows(table: TableData, selectedIndices: ReadonlySet<number>): TableData {
  const next = cloneTableData(table);
  if (selectedIndices.size === 0) return next;
  next.rows = next.rows.filter((_, idx) => !selectedIndices.has(idx));
  return next;
}

/** Delete selected columns while ensuring at least one column always remains. */
export function deleteColumns(
  table: TableData,
  selectedIndices: ReadonlySet<number>,
  colWidths: number[] = [],
): TableSnapshot {
  const next = cloneTableData(table);
  const nextWidths = [...colWidths];
  if (selectedIndices.size === 0) return { table: next, colWidths: nextWidths };

  const keepIndices = next.headers
    .map((_, idx) => idx)
    .filter((idx) => !selectedIndices.has(idx));

  if (keepIndices.length === 0) {
    return { table: next, colWidths: nextWidths };
  }

  next.headers = keepIndices.map((idx) => next.headers[idx]!);
  next.alignments = keepIndices.map((idx) => next.alignments[idx]!);
  next.rows = next.rows.map((row) => keepIndices.map((idx) => row[idx] ?? ""));

  const filteredWidths =
    nextWidths.length === table.headers.length
      ? keepIndices.map((idx) => nextWidths[idx]!)
      : nextWidths;

  return { table: next, colWidths: filteredWidths };
}

/** Bounded undo/redo snapshot stack for TableData + column widths. */
export class TableHistory {
  private entries: TableSnapshot[] = [];
  private index = -1;
  private readonly maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  reset(table: TableData, colWidths: number[]): void {
    this.entries = [{ table: cloneTableData(table), colWidths: [...colWidths] }];
    this.index = 0;
  }

  current(): TableSnapshot | null {
    const entry = this.entries[this.index];
    return entry
      ? { table: cloneTableData(entry.table), colWidths: [...entry.colWidths] }
      : null;
  }

  hasTableChangedFromCurrent(table: TableData): boolean {
    const cur = this.entries[this.index];
    if (!cur) return false;
    return JSON.stringify(cur.table) !== JSON.stringify(table);
  }

  push(table: TableData, colWidths: number[]): boolean {
    const cur = this.entries[this.index];
    if (cur && JSON.stringify(cur.table) === JSON.stringify(table)) {
      cur.colWidths = [...colWidths];
      return false;
    }

    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ table: cloneTableData(table), colWidths: [...colWidths] });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.index = this.entries.length - 1;
    return true;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  undo(): TableSnapshot | null {
    if (!this.canUndo()) return null;
    this.index -= 1;
    return this.current();
  }

  redo(): TableSnapshot | null {
    if (!this.canRedo()) return null;
    this.index += 1;
    return this.current();
  }
}
