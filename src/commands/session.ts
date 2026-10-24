import type { TableData } from "../core/model";
import { type HostToWebview, validateWebviewMessage } from "../core/protocol";
import { findTableAtLine } from "../formats/markdown/parser";
import { serializeTable } from "../formats/markdown/serializer";
import { parseCsv, serializeCsv, detectDelimiter } from "../formats/csv/csv";
import { parseJsonTable, serializeJsonTable } from "../formats/json/json";
import { UnsupportedTableError } from "../core/errors";
import type { MarkdownTable } from "../formats/markdown/types";

/** Everything the session needs from the editor, so it can be tested without VS Code. */
export interface SessionHost {
  /** Current full document text, or undefined if the document is closed/unavailable. */
  getText(): string | undefined;
  /** Replace lines startLine..endLine (inclusive) with newText. Resolves false on failure. */
  replaceLines(startLine: number, endLine: number, newText: string): Promise<boolean>;
  post(message: HostToWebview): void;
  close(): void;
  notify(level: "info" | "warning" | "error", message: string): void;
}

/** A format-independent description of what is being edited and how to write it back. */
export interface EditTarget {
  format: "markdown" | "csv" | "json";
  data: TableData;
  /** 0-based inclusive line range that Apply replaces. */
  startLine: number;
  endLine: number;
  /** Returns an error message if the source range changed since opening. */
  checkConflict(text: string | undefined): ConflictCheck;
  serialize(data: TableData): string;
}

export type StartResult = { ok: true; target: EditTarget } | { ok: false; message: string; line?: number };
export type ConflictCheck = { ok: true } | { ok: false; message: string };

const CONFLICT_MESSAGE =
  "The content was changed in the document after the editor was opened. Nothing was overwritten. Reopen the editor to reload, or cancel.";

/** Locate the editable table at the cursor line, or explain why not. */
export function locateTable(text: string, cursorLine: number): StartResult {
  const found = findTableAtLine(text, cursorLine);
  if (found.kind === "none") {
    return { ok: false, message: "Place the cursor inside a Markdown table to edit it." };
  }
  if (found.kind === "unsupported") {
    return { ok: false, message: `This table cannot be edited visually: ${found.reason}` };
  }
  const snapshot = found.table;
  return {
    ok: true,
    target: {
      format: "markdown",
      data: snapshot.data,
      startLine: snapshot.startLine,
      endLine: snapshot.endLine,
      checkConflict: (current) => checkConflict(current, snapshot),
      serialize: (d) => serializeTable(d, { indent: snapshot.indent, eol: snapshot.eol }),
    },
  };
}

/** Treat the whole document as one CSV/TSV table. */
export function locateCsv(text: string, fileName: string): StartResult {
  try {
    const delimiter = detectDelimiter(text, fileName);
    const { data, meta } = parseCsv(text, delimiter);
    const lastLine = text.split(/\r\n|\n|\r/).length - 1;
    return {
      ok: true,
      target: {
        format: "csv",
        data,
        startLine: 0,
        endLine: lastLine,
        checkConflict: (current) =>
          current === text ? { ok: true } : current === undefined
            ? { ok: false, message: "The document is no longer available." }
            : { ok: false, message: CONFLICT_MESSAGE },
        serialize: (d) => serializeCsv(d, meta),
      },
    };
  } catch (e) {
    if (e instanceof UnsupportedTableError) {
      return { ok: false, message: `This file cannot be edited visually: ${e.message}`, line: e.line };
    }
    throw e;
  }
}

/** Treat the whole document as a JSON array of objects. */
export function locateJson(text: string): StartResult {
  try {
    const { data, meta } = parseJsonTable(text);
    return {
      ok: true,
      target: {
        format: "json",
        data,
        startLine: 0,
        endLine: text.split(/\r\n|\n|\r/).length - 1,
        checkConflict: (current) =>
          current === text
            ? { ok: true }
            : current === undefined
              ? { ok: false, message: "The document is no longer available." }
              : { ok: false, message: CONFLICT_MESSAGE },
        serialize: (d) => serializeJsonTable(d, meta),
      },
    };
  } catch (e) {
    if (e instanceof UnsupportedTableError) {
      return { ok: false, message: `This file cannot be edited visually: ${e.message}`, line: e.line };
    }
    throw e;
  }
}

/** Verify the table's source range is unchanged since the editor was opened. */
export function checkConflict(text: string | undefined, snapshot: MarkdownTable): ConflictCheck {
  if (text === undefined) return { ok: false, message: "The document is no longer available." };
  const found = findTableAtLine(text, snapshot.startLine);
  if (
    found.kind !== "found" ||
    found.table.startLine !== snapshot.startLine ||
    found.table.endLine !== snapshot.endLine ||
    found.table.sourceText !== snapshot.sourceText
  ) {
    return { ok: false, message: CONFLICT_MESSAGE };
  }
  return { ok: true };
}

export class EditSession {
  private applying = false;

  constructor(
    private readonly target: EditTarget,
    private readonly host: SessionHost,
  ) {}

  async handleMessage(raw: unknown): Promise<void> {
    const msg = validateWebviewMessage(raw);
    if (!msg) {
      // Invalid messages are ignored: never touch the document.
      return;
    }
    switch (msg.type) {
      case "ready":
        this.host.post({ type: "init", table: this.target.data, format: this.target.format });
        return;
      case "cancel":
        this.host.close();
        return;
      case "apply":
        await this.apply(msg.table);
        return;
    }
  }

  private async apply(table: TableData): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      const check = this.target.checkConflict(this.host.getText());
      if (!check.ok) {
        this.host.post({ type: "conflict", message: check.message });
        this.host.notify("error", check.message);
        return;
      }
      let newText: string;
      try {
        newText = this.target.serialize(table);
      } catch (e) {
        if (!(e instanceof UnsupportedTableError)) throw e;
        this.host.post({ type: "error", message: e.message });
        this.host.notify("error", e.message);
        return;
      }
      const ok = await this.host.replaceLines(this.target.startLine, this.target.endLine, newText);
      if (!ok) {
        const message = "Failed to apply changes to the document.";
        this.host.post({ type: "error", message });
        this.host.notify("error", message);
        return;
      }
      this.host.notify("info", "Table updated.");
      this.host.close();
    } finally {
      this.applying = false;
    }
  }
}
