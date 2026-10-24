# Structured Data Editor (VS Code extension)

Edit Markdown tables visually in VS Code and apply the result back to the file, while keeping plain, Git/AI-friendly text.

> **Status: Phase 1 (Markdown tables) and Phase 2 (CSV/TSV) and Phase 3 (JSON array of objects) and Phase 4 (export) are implemented.**

## Setup & run

```bash
npm install
npm run build
```

Open this folder in VS Code and press **F5** (launch config "Run Extension") to start the Extension Development Host.

## Usage

1. Open a Markdown file and put the cursor inside a pipe table.
2. Run **Structured Data Editor: Edit Table Visually** from the Command Palette.
3. Edit cells, add/delete rows and columns, set column alignment.
4. **Apply** replaces only that table's lines in the document (then save normally). **Cancel** changes nothing.

If the table changed in the document after the editor was opened, Apply refuses to overwrite and asks you to reopen or cancel.

## CSV / TSV

Open a `.csv` / `.tsv` file and run the same command. The whole file is shown as a grid (first row = header).

- Delimiter is detected (`,` `;` `\t` `|`; `.tsv` = tab). Quotes, embedded delimiters, line breaks and empty cells are handled.
- Line ending and trailing newline are preserved. Encoding/BOM are handled by VS Code's document layer and are left untouched.
- Files with ragged rows (differing field counts) or malformed quoting are **rejected with a message**, never truncated.
- On save, fields are re-quoted only where needed, so unnecessary original quotes may be dropped.

## JSON (array of objects)

Open a `.json` file whose top level is an array of objects and run the same command.

- Columns = union of keys (first-seen order); a missing key is an **empty cell** and stays absent on save.
- Types are preserved by how the cell text is written: `1`, `true`, `null` are number/boolean/null; a string that looks like one of those (e.g. `"01234"`, `"true"`, empty string) is shown **quoted**; other text is a plain string. Type text yourself the same way to change a type.
- Nested objects/arrays are shown as compact JSON and are editable as JSON text; invalid JSON is rejected on Apply (nothing is written).
- Rejected up front: non-array top level, non-object items, empty arrays, invalid JSON. Duplicate/empty column names are rejected on Apply.
- Indent (spaces/tab), line endings and trailing newline are preserved. Key order inside each object follows the column order; duplicate keys in the source and number formatting (e.g. `1.0` -> `1`, huge integers) are normalized by JSON parsing.

## Export As…

Run **Structured Data Editor: Export As...** in a Markdown (cursor in a table), CSV/TSV or JSON file. Pick a target format, review the confirmation dialog (source range, column order, row count and **warnings about lost information**), then choose the destination. Export never modifies the source file and refuses to overwrite it.

- Markdown/CSV -> JSON: cell text becomes typed values (numbers, `true/false/null`); other text stays a string; empty cells become `""`. Needs unique, non-empty headers.
- JSON -> Markdown/CSV: types, missing keys and nested values are flattened to text (warned).
- Markdown -> CSV/JSON: column alignment is dropped (warned). CSV/JSON -> Markdown: line breaks in cells become `<br>` (warned). CSV export always uses `,` and LF.

## Development

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run build` | Bundle extension + webview into `dist/` |

## Architecture

- `src/formats/markdown/` – parser/serializer (format adapter, no VS Code dependency)
- `src/core/` – shared `TableData` model, webview message protocol + validation
- `src/commands/session.ts` – apply/cancel/conflict logic behind a `SessionHost` interface (testable without VS Code)
- `src/extension.ts` – VS Code glue (command, webview panel with CSP, document edit)
- `src/webview/main.ts` – plain TypeScript grid UI (no framework needed for Phase 1)

CSV/JSON adapters can later be added under `src/formats/` using the same `TableData` model.

## Known limitations

- Tables with rows whose cell count differs from the header, or header/delimiter mismatch, are rejected with a message (never silently truncated).
- Tables inside blockquotes or indented 4+ spaces are not detected.
- Output is normalized: outer pipes, padded columns. Newlines in cells become `<br>`. Cell whitespace is trimmed.
- Inline pipes must be escaped as `\|` (GFM rule); they are preserved/escaped on save.
- CSV: single-sheet grid only; no type inference (all cells are text).
- No copy/paste, keyboard shortcuts or undo/redo in the grid yet.
- The VS Code integration (extension host + webview) has not been covered by automated integration tests.

---

## About AI Nexus

Developed and maintained by **[AI Nexus](https://ai-nexus.jp)** — Empowering business transformation and developer productivity through AI and modern tooling.

