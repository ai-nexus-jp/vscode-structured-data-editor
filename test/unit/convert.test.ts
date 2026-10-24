import { describe, expect, it } from "vitest";
import { exportTable } from "../../src/formats/convert";
import { parseJsonTable } from "../../src/formats/json/json";
import type { TableData } from "../../src/core/model";

const t = (headers: string[], rows: string[][], al?: TableData["alignments"]): TableData => ({
  headers,
  alignments: al ?? headers.map(() => "none"),
  rows,
});

describe("exportTable", () => {
  it("markdown -> csv quotes properly and warns on alignment loss", () => {
    const r = exportTable(t(["a", "b"], [["x,y", "2"]], ["left", "none"]), "markdown", "csv");
    expect(r.content).toBe('a,b\n"x,y",2\n');
    expect(r.warnings.join()).toMatch(/alignment/);
  });

  it("csv -> markdown preserves headers/column order; warns on newlines", () => {
    const r = exportTable(t(["b", "a"], [["1", "x\ny"]]), "csv", "markdown");
    expect(r.content.split("\n")[0]).toBe("| b   | a      |");
    expect(r.content).toContain("x<br>y");
    expect(r.warnings.join()).toMatch(/<br>/);
  });

  it("csv -> json infers types and keeps leading-zero text", () => {
    const r = exportTable(t(["id", "zip", "ok", "n"], [["1", "01234", "true", ""]]), "csv", "json");
    expect(JSON.parse(r.content)).toEqual([{ id: 1, zip: "01234", ok: true, n: "" }]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("json -> csv warns about lost types, missing keys and nesting", () => {
    const { data } = parseJsonTable('[{"a":1,"o":{"x":1}},{"a":"s"}]');
    const r = exportTable(data, "json", "csv");
    expect(r.content).toBe('a,o\n1,"{""x"":1}"\ns,\n');
    const w = r.warnings.join("|");
    expect(w).toMatch(/types are lost/);
    expect(w).toMatch(/Missing/);
    expect(w).toMatch(/Nested/);
  });

  it("json -> markdown with only strings has no warnings", () => {
    const { data } = parseJsonTable('[{"a":"x"}]');
    expect(exportTable(data, "json", "markdown").warnings).toEqual([]);
  });

  it("rejects json export with duplicate or empty headers", () => {
    expect(() => exportTable(t(["a", "a"], [["1", "2"]]), "csv", "json")).toThrow(/unique/);
    expect(() => exportTable(t([""], [["1"]]), "csv", "json")).toThrow(/non-empty/);
  });

  it("rejects same-format export", () => {
    expect(() => exportTable(t(["a"], []), "csv", "csv")).toThrow();
  });
});
