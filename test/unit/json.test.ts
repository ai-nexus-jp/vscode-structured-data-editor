import { describe, expect, it } from "vitest";
import { displayCell, parseCell, parseJsonTable, serializeJsonTable } from "../../src/formats/json/json";
import { EditSession, locateJson, type SessionHost } from "../../src/commands/session";

const rt = (text: string) => {
  const { data, meta } = parseJsonTable(text);
  return serializeJsonTable(data, meta);
};

describe("json table", () => {
  it("round-trips types, nesting and indentation unchanged", () => {
    const text =
      JSON.stringify(
        [
          { id: 1, name: "Alice", ok: true, tag: null, ratio: 1.5, s: "123", t: "true", e: "", q: '"x"', obj: { a: [1, 2] }, arr: [1, "b"] },
          { id: 2, name: "Bob" },
        ],
        null,
        4,
      ) + "\n";
    expect(rt(text)).toBe(text);
  });

  it("keeps tabs and CRLF", () => {
    const text = JSON.stringify([{ a: 1 }], null, "\t").replace(/\n/g, "\r\n");
    expect(rt(text)).toBe(text);
  });

  it("shows missing keys as empty cells and keeps them absent", () => {
    const { data } = parseJsonTable('[{"a":1},{"b":2}]');
    expect(data.headers).toEqual(["a", "b"]);
    expect(data.rows).toEqual([["1", ""], ["", "2"]]);
    expect(JSON.parse(rt('[{"a":1},{"b":2}]'))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("displays ambiguous strings quoted", () => {
    expect(displayCell("123")).toBe('"123"');
    expect(displayCell("")).toBe('""');
    expect(displayCell("hi")).toBe("hi");
    expect(parseCell('"123"')).toBe("123");
    expect(parseCell("12")).toBe(12);
    expect(parseCell("2024-01-01")).toBe("2024-01-01");
  });

  it("infers types from edited text", () => {
    const { meta } = parseJsonTable('[{"a":1}]');
    const out = serializeJsonTable(
      { headers: ["a", "b", "c", "d"], alignments: ["none", "none", "none", "none"], rows: [["7", "true", "null", "text"]] },
      meta,
    );
    expect(JSON.parse(out)).toEqual([{ a: 7, b: true, c: null, d: "text" }]);
  });

  it("rejects non-array, non-object items, empty arrays and invalid JSON", () => {
    expect(() => parseJsonTable('{"a":1}')).toThrow(/top-level array/);
    expect(() => parseJsonTable("[1,2]")).toThrow(/not an object/);
    expect(() => parseJsonTable("[]")).toThrow(/empty/);
    expect(() => parseJsonTable("[{")).toThrow(/Invalid JSON/);
  });

  it("rejects duplicate/empty headers and malformed JSON-looking cells on save", () => {
    const meta = { indent: 2, eol: "\n" as const, trailingNewline: false };
    const t = (headers: string[], row: string[]) => ({ headers, alignments: headers.map(() => "none" as const), rows: [row] });
    expect(() => serializeJsonTable(t(["a", "a"], ["1", "2"]), meta)).toThrow(/Duplicate/);
    expect(() => serializeJsonTable(t([" "], ["1"]), meta)).toThrow(/empty/);
    expect(() => serializeJsonTable(t(["a"], ["[1,"]), meta)).toThrow(/invalid/);
  });

  it("does not let __proto__ keys pollute", () => {
    const out = rt('[{"__proto__":1,"a":2}]');
    expect(JSON.parse(out)[0]).toHaveProperty("a", 2);
    expect(out).toContain('"__proto__"');
  });
});

describe("json edit target", () => {
  const DOC = '[\n  {\n    "a": 1\n  }\n]\n';
  function setup() {
    let cur = DOC;
    let closed = false;
    const posted: string[] = [];
    const host: SessionHost = {
      getText: () => cur,
      async replaceLines(s, e, n) {
        const lines = cur.split("\n");
        lines.splice(s, e - s + 1, ...n.split("\n"));
        cur = lines.join("\n");
        return true;
      },
      post: (m) => void posted.push(m.type),
      close: () => void (closed = true),
      notify: () => {},
    };
    const r = locateJson(DOC);
    if (!r.ok) throw new Error(r.message);
    return { session: new EditSession(r.target, host), get: () => cur, closed: () => closed, posted };
  }

  it("applies and keeps formatting", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "apply", table: { headers: ["a"], alignments: ["none"], rows: [["2"]] } });
    expect(s.get()).toBe('[\n  {\n    "a": 2\n  }\n]\n');
    expect(s.closed()).toBe(true);
  });

  it("reports serialization errors without touching the document", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "apply", table: { headers: ["a", "a"], alignments: ["none", "none"], rows: [["1", "2"]] } });
    expect(s.get()).toBe(DOC);
    expect(s.closed()).toBe(false);
    expect(s.posted).toContain("error");
  });
});
