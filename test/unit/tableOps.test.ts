import { describe, expect, it } from "vitest";
import type { TableData } from "../../src/core/model";
import {
  TableHistory,
  deleteColumns,
  deleteRows,
  moveColumn,
  moveRow,
  sortRowsByColumn,
} from "../../src/webview/tableOps";

const sampleTable = (): TableData => ({
  headers: ["ID", "Name", "Score"],
  alignments: ["right", "left", "center"],
  rows: [
    ["10", "Charlie", "85.5"],
    ["2", "alice", "100"],
    ["1", "", "90"],
    ["20", "Bob", ""],
  ],
});

describe("sortRowsByColumn", () => {
  it("sorts numeric values numerically and keeps empty cells at the bottom", () => {
    const asc = sortRowsByColumn(sampleTable(), 0, "asc");
    expect(asc.rows.map((r) => r[0])).toEqual(["1", "2", "10", "20"]);

    const desc = sortRowsByColumn(sampleTable(), 0, "desc");
    expect(desc.rows.map((r) => r[0])).toEqual(["20", "10", "2", "1"]);

    const scoreAsc = sortRowsByColumn(sampleTable(), 2, "asc");
    expect(scoreAsc.rows.map((r) => r[2])).toEqual(["85.5", "90", "100", ""]);

    const scoreDesc = sortRowsByColumn(sampleTable(), 2, "desc");
    expect(scoreDesc.rows.map((r) => r[2])).toEqual(["100", "90", "85.5", ""]);
  });

  it("sorts text case-insensitively and puts empty strings last in both directions", () => {
    const asc = sortRowsByColumn(sampleTable(), 1, "asc");
    expect(asc.rows.map((r) => r[1])).toEqual(["alice", "Bob", "Charlie", ""]);

    const desc = sortRowsByColumn(sampleTable(), 1, "desc");
    expect(desc.rows.map((r) => r[1])).toEqual(["Charlie", "Bob", "alice", ""]);
  });

  it("does not mutate the input table", () => {
    const original = sampleTable();
    const sorted = sortRowsByColumn(original, 0, "asc");
    expect(original.rows[0]?.[0]).toBe("10");
    expect(sorted.rows[0]?.[0]).toBe("1");
  });
});

describe("moveRow", () => {
  it("moves rows up and down safely", () => {
    const movedUp = moveRow(sampleTable(), 2, 0);
    expect(movedUp.rows.map((r) => r[0])).toEqual(["1", "10", "2", "20"]);

    const movedDown = moveRow(sampleTable(), 0, 3);
    expect(movedDown.rows.map((r) => r[0])).toEqual(["2", "1", "20", "10"]);
  });

  it("ignores out-of-bounds indices", () => {
    const orig = sampleTable();
    expect(moveRow(orig, -1, 1)).toEqual(orig);
    expect(moveRow(orig, 0, 99)).toEqual(orig);
  });
});

describe("moveColumn", () => {
  it("moves headers, alignments, row cells, and column widths together", () => {
    const { table, colWidths } = moveColumn(sampleTable(), 2, 0, [80, 140, 100]);
    expect(table.headers).toEqual(["Score", "ID", "Name"]);
    expect(table.alignments).toEqual(["center", "right", "left"]);
    expect(table.rows[0]).toEqual(["85.5", "10", "Charlie"]);
    expect(colWidths).toEqual([100, 80, 140]);
  });
});

describe("deleteRows and deleteColumns", () => {
  it("deletes multiple selected rows", () => {
    const next = deleteRows(sampleTable(), new Set([0, 2]));
    expect(next.rows.map((r) => r[0])).toEqual(["2", "20"]);
  });

  it("deletes multiple selected columns while keeping widths synced", () => {
    const { table, colWidths } = deleteColumns(sampleTable(), new Set([0, 2]), [80, 140, 100]);
    expect(table.headers).toEqual(["Name"]);
    expect(table.alignments).toEqual(["left"]);
    expect(table.rows).toEqual([["Charlie"], ["alice"], [""], ["Bob"]]);
    expect(colWidths).toEqual([140]);
  });

  it("refuses to delete all columns", () => {
    const orig = sampleTable();
    const { table, colWidths } = deleteColumns(orig, new Set([0, 1, 2]), [80, 140, 100]);
    expect(table).toEqual(orig);
    expect(colWidths).toEqual([80, 140, 100]);
  });
});

describe("TableHistory", () => {
  it("supports undo, redo, branch truncation, and duplicate suppression", () => {
    const history = new TableHistory(5);
    const t0 = sampleTable();
    history.reset(t0, [80, 140, 100]);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // Duplicate table push should be ignored
    expect(history.push(t0, [90, 140, 100])).toBe(false);

    const t1 = sortRowsByColumn(t0, 0, "asc");
    expect(history.push(t1, [90, 140, 100])).toBe(true);
    expect(history.hasTableChangedFromCurrent(t0)).toBe(true);
    expect(history.hasTableChangedFromCurrent(t1)).toBe(false);

    const t2 = moveRow(t1, 0, 1);
    history.push(t2, [90, 140, 100]);

    expect(history.canUndo()).toBe(true);
    const u1 = history.undo();
    expect(u1?.table).toEqual(t1);
    expect(history.canRedo()).toBe(true);

    const u2 = history.undo();
    expect(u2?.table).toEqual(t0);
    expect(history.canUndo()).toBe(false);

    const r1 = history.redo();
    expect(r1?.table).toEqual(t1);

    // Pushing after undo truncates future redo states
    const t3 = deleteRows(t1, new Set([3]));
    history.push(t3, [90, 140, 100]);
    expect(history.canRedo()).toBe(false);
    expect(history.current()?.table).toEqual(t3);
  });

  it("respects maxEntries limit", () => {
    const history = new TableHistory(3);
    const base = sampleTable();
    history.reset(base, [80, 140, 100]);
    for (let i = 1; i <= 4; i++) {
      const next = { ...base, headers: [`H${i}`, "Name", "Score"], rows: base.rows.map((r) => [...r]) };
      history.push(next, [80, 140, 100]);
    }
    expect(history.undo()?.table.headers[0]).toBe("H3");
    expect(history.undo()?.table.headers[0]).toBe("H2");
    expect(history.canUndo()).toBe(false);
  });
});
