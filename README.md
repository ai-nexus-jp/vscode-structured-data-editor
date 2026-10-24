# Structured Data Editor for VS Code

**Edit Markdown tables, CSV, TSV, and JSON visually as an intuitive spreadsheet — while keeping your files 100% plain, readable, and Git/AI-friendly.**

---

## Why Structured Data Editor?

Modern coding assistants and LLMs thrive on clean text files (Markdown tables, CSV, JSON). But humans struggle to read and edit raw pipe tables or complex delimited lines manually.

**Structured Data Editor** bridges this gap:
- **Visual Grid Editing**: Click, type, add/remove rows and columns just like in Excel.
- **Safe & Non-Destructive**: Edits only the targeted table or file. Detects external changes to prevent accidental overwrites.
- **100% Offline & Private**: Zero network telemetry, zero external API calls. Your data never leaves your machine.
- **Format Conversion**: Effortlessly export between Markdown, CSV, and JSON with informative warnings for lossy conversions.

---

## Features & Supported Formats

### 1. Markdown Tables
- **In-place visual editing**: Place your cursor anywhere inside a Markdown table and launch the editor.
- **Precision replacement**: Only the lines of that specific table are updated upon **Apply**; headings, code fences, and paragraphs remain untouched.
- **Full alignment support**: Supports left, center, right alignments and wide/CJK characters for clean formatting.

### 2. CSV & TSV Files
- **Full-file grid view**: Opens `.csv` and `.tsv` files as a clean grid with row/column management.
- **Smart parsing**: Automatically detects delimiters (`,` `;` `\t` `|`) and handles quotes, multiline cells, and empty fields.
- **Integrity protection**: Files with ragged/inconsistent columns are safely rejected with a clear message rather than silently truncated.

### 3. JSON (Array of Objects)
- **Table view for JSON**: Visualizes top-level arrays of objects as columns and rows.
- **Type-safe preservation**: Numbers, booleans, and `null` retain their native JSON types; strings that resemble numbers/booleans are quoted for clarity.
- **Nested structures**: Nested arrays and objects are displayed and editable as compact JSON strings.

### 4. Smart Export ("Export As...")
- Convert tables effortlessly between **Markdown**, **CSV**, and **JSON**.
- Features an interactive modal preview detailing the source range, column order, and **explicit warnings if types or alignments will be simplified**.
- Never overwrites the source file.

---

## How to Use

1. Open a Markdown, CSV, TSV, or JSON file in VS Code.
2. In Markdown, place your cursor inside a table.
3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
   - **`Structured Data Editor: Edit Table Visually`**
4. Edit cells inline, add or remove rows and columns:
   - Click **Apply** to write changes back to your file.
   - Click **Cancel** to discard all edits.
5. To convert format, run:
   - **`Structured Data Editor: Export As...`**

---

---

## Troubleshooting & FAQ

### Q: Why do I see "Record X has Y fields but the header has Z"?
**A:** This error occurs when a CSV row has an unexpected number of columns (e.g., more or fewer commas than the header row).

**Most common causes:**
1. **Unquoted commas inside text**: Numbers like `1,500` or sentences like `Hello, world` must be enclosed in double quotes (`"1,500"`, `"Hello, world"`). Otherwise, the comma is treated as a column separator.
2. **Missing closing quotes**: An unmatched quote character on a previous line can cause lines to merge.

**Quick fix:**
- Click the **"Go to Line X"** button directly on the error notification to jump right to the problem line.
- Wrap the field containing commas with double quotes (`"`), or fix missing columns, and run the command again.

> **Why we don't fix it automatically:** Silently guessing how to split or merge unquoted columns could corrupt or erase your valuable data. Structured Data Editor prioritizes **data integrity** and alerts you safely.

## Privacy & Security

- **Local Execution**: All parsing, rendering, and serialization run locally inside your VS Code instance.
- **No Data Telemetry**: We do not collect, transmit, or analyze any user content or metrics.
- **Strict Content Security**: The editor webview is sandboxed with strict Content Security Policies (CSP).

---

## Contributing & Development

For local setup, building from source, testing, and contribution guidelines, please see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## About AI Nexus

Developed and maintained by **[AI Nexus](https://ai-nexus.jp)** — Empowering business transformation and developer productivity through AI and modern tooling.
