import { describe, expect, it, vi } from "vitest";
import { EditSession, locateTable, type SessionHost } from "../../src/commands/session";
import type { HostToWebview } from "../../src/core/protocol";

const DOC = "# T\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n";

function setup(initial = DOC) {
  let text = initial;
  const posted: HostToWebview[] = [];
  const notes: string[] = [];
  let closed = false;
  const host: SessionHost = {
    getText: () => text,
    async replaceLines(s, e, n) {
      const lines = text.split("\n");
      lines.splice(s, e - s + 1, ...n.split("\n"));
      text = lines.join("\n");
      return true;
    },
    post: (m) => void posted.push(m),
    close: () => void (closed = true),
    notify: (l, m) => void notes.push(`${l}:${m}`),
  };
  const located = locateTable(initial, 3);
  if (!located.ok) throw new Error("no table");
  const session = new EditSession(located.target, host);
  return { session, host, posted, notes, getText: () => text, isClosed: () => closed, setText: (t: string) => (text = t) };
}

const edited = {
  headers: ["a", "b", "c"],
  alignments: ["none", "none", "right"],
  rows: [["1", "2", "3"]],
};

describe("locateTable", () => {
  it("finds the table when the cursor is inside", () => {
    expect(locateTable(DOC, 2).ok).toBe(true);
    expect(locateTable(DOC, 4).ok).toBe(true);
  });
  it("refuses outside the table", () => {
    const r = locateTable(DOC, 0);
    expect(r.ok).toBe(false);
  });
});

describe("EditSession", () => {
  it("sends init on ready", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "ready" });
    expect(s.posted[0]?.type).toBe("init");
  });

  it("apply updates only the table", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "apply", table: edited });
    expect(s.getText()).toBe(
      "# T\n\n| a   | b   |   c |\n| --- | --- | --: |\n| 1   | 2   |   3 |\n\nafter\n",
    );
    expect(s.isClosed()).toBe(true);
  });

  it("cancel leaves the document unchanged", async () => {
    const s = setup();
    await s.session.handleMessage({ type: "cancel" });
    expect(s.getText()).toBe(DOC);
    expect(s.isClosed()).toBe(true);
  });

  it("does not overwrite on conflict", async () => {
    const s = setup();
    const changed = DOC.replace("| 1 | 2 |", "| 9 | 9 |");
    s.setText(changed);
    await s.session.handleMessage({ type: "apply", table: edited });
    expect(s.getText()).toBe(changed);
    expect(s.isClosed()).toBe(false);
    expect(s.posted.some((m) => m.type === "conflict")).toBe(true);
  });

  it("does not overwrite when lines shifted above the table", async () => {
    const s = setup();
    s.setText("new line\n" + DOC);
    await s.session.handleMessage({ type: "apply", table: edited });
    expect(s.getText()).toBe("new line\n" + DOC);
  });

  it("fails safely when the document is gone", async () => {
    const s = setup();
    s.host.getText = () => undefined;
    const replace = vi.spyOn(s.host, "replaceLines");
    await s.session.handleMessage({ type: "apply", table: edited });
    expect(replace).not.toHaveBeenCalled();
    expect(s.isClosed()).toBe(false);
  });

  it("ignores invalid messages", async () => {
    const s = setup();
    for (const bad of [
      null,
      "apply",
      { type: "apply" },
      { type: "apply", table: { headers: ["a"], alignments: ["none"], rows: [["1", "2"]] } },
      { type: "apply", table: { headers: ["a"], alignments: ["bogus"], rows: [] } },
      { type: "apply", table: { headers: [1], alignments: ["none"], rows: [] } },
      { type: "evil" },
    ]) {
      await s.session.handleMessage(bad);
    }
    expect(s.getText()).toBe(DOC);
    expect(s.isClosed()).toBe(false);
  });

  it("does not report success when replace fails", async () => {
    const s = setup();
    s.host.replaceLines = async () => false;
    await s.session.handleMessage({ type: "apply", table: edited });
    expect(s.notes.some((n) => n.startsWith("info:"))).toBe(false);
    expect(s.isClosed()).toBe(false);
  });
});
