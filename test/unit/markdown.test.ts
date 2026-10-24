import { describe, expect, it } from "vitest";
import { findTableAtLine, splitRow } from "../../src/formats/markdown/parser";
import { serializeTable } from "../../src/formats/markdown/serializer";

const sample = [
  "# Title",
  "",
  "Intro text with a | pipe.",
  "",
  "| Name  | Age | City |",
  "| :---- | --: | :--: |",
  "| Alice |  30 | Tokyo |",
  "| Bob   |     | Osaka |",
  "",
  "After text.",
  "",
  "```md",
  "| Fake | Table |",
  "| ---- | ----- |",
  "| a    | b     |",
  "```",
  "",
].join("\n");

function found(text: string, line: number) {
  const r = findTableAtLine(text, line);
  if (r.kind !== "found") throw new Error(`expected table, got ${r.kind}`);
  return r.table;
}

describe("markdown parser", () => {
  it("parses a normal table with alignments and empty cells", () => {
    const t = found(sample, 5);
    expect(t.startLine).toBe(4);
    expect(t.endLine).toBe(7);
    expect(t.data.headers).toEqual(["Name", "Age", "City"]);
    expect(t.data.alignments).toEqual(["left", "right", "center"]);
    expect(t.data.rows).toEqual([
      ["Alice", "30", "Tokyo"],
      ["Bob", "", "Osaka"],
    ]);
  });

  it("returns none outside tables and for table-like text in code fences", () => {
    expect(findTableAtLine(sample, 0).kind).toBe("none");
    expect(findTableAtLine(sample, 2).kind).toBe("none");
    expect(findTableAtLine(sample, 9).kind).toBe("none");
    expect(findTableAtLine(sample, 13).kind).toBe("none");
  });

  it("supports tables without outer pipes", () => {
    const t = found("a | b\n--- | ---\n1 | 2\n", 0);
    expect(t.data.rows).toEqual([["1", "2"]]);
  });

  it("handles escaped pipes", () => {
    expect(splitRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
    const t = found("| a | b |\n| - | - |\n| x \\| y | z |\n", 2);
    expect(t.data.rows[0]).toEqual(["x | y", "z"]);
    expect(serializeTable(t.data)).toContain("x \\| y");
  });

  it("rejects inconsistent column counts", () => {
    const r = findTableAtLine("| a | b |\n| - | - |\n| 1 |\n", 0);
    expect(r.kind).toBe("unsupported");
    const r2 = findTableAtLine("| a | b |\n| - |\n", 0);
    expect(r2.kind).toBe("unsupported");
  });

  it("ends the table at a blank line or plain text", () => {
    const t = found("| a |\n| - |\n| 1 |\ntext\n", 0);
    expect(t.endLine).toBe(2);
  });

  it("handles header-only tables (no data rows)", () => {
    const t = found("| a | b |\n| - | - |\n\nx", 0);
    expect(t.data.rows).toEqual([]);
    expect(serializeTable(t.data)).toBe("| a   | b   |\n| --- | --- |");
  });

  it("detects CRLF", () => {
    const t = found("| a |\r\n| - |\r\n| 1 |\r\n", 0);
    expect(t.eol).toBe("\r\n");
    expect(t.sourceText).toBe("| a |\r\n| - |\r\n| 1 |");
  });
});

describe("markdown serializer", () => {
  it("round-trips and aligns", () => {
    const t = found(sample, 5);
    const out = serializeTable(t.data);
    expect(out).toBe(
      [
        "| Name  | Age | City  |",
        "| :---- | --: | :---: |",
        "| Alice |  30 | Tokyo |",
        "| Bob   |     | Osaka |",
      ].join("\n"),
    );
  });

  it("is idempotent", () => {
    const t = found(sample, 5);
    const once = serializeTable(t.data);
    const again = serializeTable(found(once, 0).data);
    expect(again).toBe(once);
  });

  it("pads wide characters by display width", () => {
    const out = serializeTable({ headers: ["名前"], alignments: ["none"], rows: [["ab"]] });
    expect(out).toBe("| 名前 |\n| ---- |\n| ab   |");
  });

  it("converts newlines in cells to <br>", () => {
    const out = serializeTable({ headers: ["a"], alignments: ["none"], rows: [["x\ny"]] });
    expect(out).toContain("x<br>y");
  });
});
