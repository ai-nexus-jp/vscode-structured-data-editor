import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, serializeCsv } from "../../src/formats/csv/csv";
import { EditSession, locateCsv, type SessionHost } from "../../src/commands/session";

const roundTrip = (text: string, d = ",") => {
  const { data, meta } = parseCsv(text, d);
  return serializeCsv(data, meta);
};

describe("csv parser/serializer", () => {
  it("parses basic records and empty cells", () => {
    const { data } = parseCsv("a,b,c\n1,,3\n", ",");
    expect(data.headers).toEqual(["a", "b", "c"]);
    expect(data.rows).toEqual([["1", "", "3"]]);
  });

  it("handles quotes, embedded delimiters, quotes and newlines", () => {
    const text = 'name,note\n"Smith, J","He said ""hi"""\nx,"line1\nline2"\n';
    const { data } = parseCsv(text, ",");
    expect(data.rows).toEqual([
      ["Smith, J", 'He said "hi"'],
      ["x", "line1\nline2"],
    ]);
    expect(roundTrip(text)).toBe(text);
  });

  it("preserves CRLF and trailing-newline presence", () => {
    expect(roundTrip("a,b\r\n1,2\r\n")).toBe("a,b\r\n1,2\r\n");
    expect(roundTrip("a,b\n1,2")).toBe("a,b\n1,2");
  });

  it("supports tab and semicolon delimiters", () => {
    expect(detectDelimiter("a\tb\n", "x.csv")).toBe("\t");
    expect(detectDelimiter("a;b;c\n", "x.csv")).toBe(";");
    expect(detectDelimiter("a,b\n", "x.tsv")).toBe("\t");
    expect(roundTrip("a;b\n1;2\n", ";")).toBe("a;b\n1;2\n");
  });

  it("rejects ragged rows instead of truncating", () => {
    expect(() => parseCsv("a,b\n1\n", ",")).toThrow(/Line 2 \(Record 2\)/);
    expect(() => parseCsv("a,b\n1,2,3\n", ",")).toThrow();
  });

  it("rejects malformed quoting and empty files", () => {
    expect(() => parseCsv('a,b\n"x,2\n', ",")).toThrow(/Unterminated/);
    expect(() => parseCsv('a,b\n"x"y,2\n', ",")).toThrow();
    expect(() => parseCsv("  \n", ",")).toThrow(/empty/);
  });

  it("quotes values that need it when serializing", () => {
    const out = serializeCsv(
      { headers: ["a"], alignments: ["none"], rows: [[""], ["x,y"], [" pad"]] },
      { delimiter: ",", eol: "\n", trailingNewline: true },
    );
    expect(out).toBe('a\n""\n"x,y"\n" pad"\n');
  });
});

describe("csv edit target", () => {
  const DOC = "a,b\n1,2\n";
  function setup(text = DOC) {
    let cur = text;
    let closed = false;
    const host: SessionHost = {
      getText: () => cur,
      async replaceLines(s, e, n) {
        const lines = cur.split("\n");
        lines.splice(s, e - s + 1, ...n.split("\n"));
        cur = lines.join("\n");
        return true;
      },
      post: () => {},
      close: () => void (closed = true),
      notify: () => {},
    };
    const r = locateCsv(text, "data.csv");
    if (!r.ok) throw new Error(r.message);
    return { session: new EditSession(r.target, host), get: () => cur, set: (t: string) => (cur = t), closed: () => closed };
  }
  const edit = { headers: ["a", "b"], alignments: ["none", "none"], rows: [["1", "9"]] };

  it("applies edits to the whole file", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "apply", table: edit });
    expect(s.get()).toBe("a,b\n1,9\n");
    expect(s.closed()).toBe(true);
  });

  it("does not overwrite on conflict", async () => {
    const s = setup();
    s.set("a,b\n1,2\n3,4\n");
    await s.session.handleMessage({ type: "apply", table: edit });
    expect(s.get()).toBe("a,b\n1,2\n3,4\n");
  });

  it("refuses ragged files", () => {
    expect(locateCsv("a,b\n1\n", "x.csv").ok).toBe(false);
  });
});
