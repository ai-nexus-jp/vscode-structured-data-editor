<div align="center">

<img src="icon.png" alt="Structured Data Editor Logo" width="100" height="100" />

# Structured Data Editor for VS Code

**Edit Markdown tables, CSV, TSV, and JSON visually as an intuitive spreadsheet — while keeping your files 100% plain text, Git-friendly, and offline.**

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/ai-nexus-jp.vscode-structured-data-editor?style=flat-square&color=blue&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ai-nexus-jp.vscode-structured-data-editor)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/ai-nexus-jp.vscode-structured-data-editor?style=flat-square&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=ai-nexus-jp.vscode-structured-data-editor)
[![CI](https://img.shields.io/github/actions/workflow/status/ai-nexus-jp/vscode-structured-data-editor/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/ai-nexus-jp/vscode-structured-data-editor/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Built by AI Nexus](https://img.shields.io/badge/Maintained%20by-AI%20Nexus-6366f1?style=flat-square)](https://ai-nexus.jp)

[English](README.md) • [日本語ドキュメント (Japanese)](README.ja.md)

<br />

<img src="images/csv-editing-demo.gif" alt="Structured Data Editor Demo - Editing CSV" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />

</div>

---

## 💡 Why Structured Data Editor?

Modern coding workflows, AI assistants, and LLM pipelines rely heavily on structured text: **Markdown tables**, **CSV datasets**, and **JSON arrays**. However, managing them manually in code editors is notoriously painful, while opening them in spreadsheet software (like Excel) often results in silent data corruption.

<div align="center">
  <img src="images/workflow-comparison.png" alt="Workflow Comparison: Traditional Excel/Manual vs Structured Data Editor" width="100%" style="max-width: 900px; border-radius: 8px; margin: 16px 0;" />
</div>

| Traditional Workflow Issues | Structured Data Editor Solution |
| :--- | :--- |
| ❌ **Painful Manual Editing**: Aligning pipe characters (`\|`) or counting commas by hand is slow and error-prone. | ✅ **Visual Spreadsheet Grid**: Click and type directly into cells. Add, remove, or rearrange rows and columns effortlessly. |
| ❌ **Excel Data Corruption**: Leading zeros vanish (`0123` → `123`), dates auto-format irreversibly, and line breaks break columns. | ✅ **100% Plain-Text Integrity**: Preserves exact strings, quotes, and data types without unwanted automatic casting. |
| ❌ **Broken Git Diff Tracking**: Saving as binary `.xlsx` makes line-by-line code reviews and git diffs impossible. | ✅ **Native Git Friendly**: Changes are written directly back to your plain-text file with clean, minimal git diffs. |
| ❌ **External App Switching**: Constant copy-pasting between external desktop tools and your editor. | ✅ **In-Editor Experience**: Zero app switching. Open, edit, and apply changes directly within VS Code. |

---

## ✨ Features & Visual Tour

### 1. Markdown Tables: In-Place Precision Editing
Place your cursor anywhere inside a Markdown table and launch the editor. Only the target table is updated when you click **Apply** — surrounding headings, markdown text, and code blocks remain completely untouched.

<div align="center">
  <img src="images/markdown-editing-demo.gif" alt="Markdown Table In-Place Editing Demo" width="100%" style="max-width: 800px; border-radius: 8px;" />
  <p><em>Seamlessly edit Markdown tables inline without breaking surrounding document structure.</em></p>
</div>

- **Full alignment support**: Preserves or adjusts left, center, and right alignments.
- **CJK & wide character awareness**: Maintains clean pipe table padding even with East Asian characters.
- **Scoped updates**: Leaves comments, fences, and document frontmatter 100% intact.

---

### 2. CSV & TSV Files: Full-Featured Grid View
Open `.csv` or `.tsv` files in an intuitive, spreadsheet-like interface.

<div align="center">
  <img src="images/csv-editor-ui.png" alt="Structured Data Editor CSV Grid UI" width="100%" style="max-width: 800px; border-radius: 8px;" />
  <p><em>Clean grid interface featuring column management, instant row manipulation, and cell editing.</em></p>
</div>

- **Auto delimiter detection**: Intelligently handles commas (`,`), tabs (`\t`), semicolons (`;`), and pipes (`\|`).
- **Robust RFC 4180 parsing**: Fully supports quoted strings, escaped quotes, multiline cell content, and empty values.
- **Data integrity protection**: If a file contains ragged rows or uneven column counts, the editor alerts you with a line-specific navigation link rather than silently dropping fields.

---

### 3. JSON (Array of Objects): Table Representation
Visualizes top-level arrays of objects as clean tables where object keys become columns.

- **Type-safe preservation**: Numbers, booleans, and `null` retain their exact types upon saving.
- **Nested data support**: Nested objects and arrays are displayed cleanly and can be inspected or edited as compact JSON strings.

---

### 4. Smart Format Export ("Export As...")
Need to convert a Markdown table into a CSV file, or turn a CSV dataset into JSON? Convert formats effortlessly without leaving your workspace.

- Convert seamlessly between **Markdown**, **CSV**, and **JSON**.
- **Lossless preview & warnings**: A modal dialog highlights the converted column order and explicitly warns if lossy conversion (such as dropping Markdown alignments) will occur.
- **Non-destructive**: Always creates a new file or target selection, never blindly overwriting your working file.

---

## 🚀 How to Use

1. **Open your file** (`.md`, `.csv`, `.tsv`, or `.json`) in VS Code.
2. If working in Markdown, place your cursor anywhere inside a table.
3. Open the **Command Palette** (`Ctrl+Shift+P` on Windows/Linux or `Cmd+Shift+P` on macOS) and run:
   ```text
   Structured Data Editor: Edit Table Visually
   ```
4. **Edit comfortably** in the visual grid:
   - Double-click or select any cell to edit its value.
   - Use the toolbar or context buttons to insert or delete rows and columns.
   - Click **Apply** to write changes back to your source file.
   - Click **Cancel** to discard edits safely.
5. To convert format, run:
   ```text
   Structured Data Editor: Export As...
   ```

---

## 🛡️ Privacy & Reliability

- **100% Local & Offline**: All parsing, rendering, and serialization run locally inside your VS Code process.
- **Zero Telemetry**: No tracking, no analytical beacons, and zero network calls. Your datasets and intellectual property never leave your workstation.
- **Strict Webview Sandbox**: UI components are isolated using a strict Content Security Policy (CSP).

---

## ❓ Troubleshooting & FAQ

### Q: Why do I see "Record X has Y fields but the header has Z"?
**A:** This safety guard occurs when a CSV row has an unexpected column count (e.g. more or fewer commas than defined by the header row).

**Common Causes:**
1. **Unquoted commas inside text values**: Text containing commas (such as `"Tokyo, Japan"` or `1,500`) must be enclosed in quotes. Without quotes, the comma is mistaken for a new column separator.
2. **Unbalanced or missing quotes**: An unclosed quotation mark can cause subsequent lines to be merged unexpectedly.

**Resolution:**
- Click the **"Go to Line X"** button directly inside the error notification to jump immediately to the problematic line.
- Wrap the field containing commas with double quotes (`"`), verify column count, and re-run the visual editor.

> **Our Philosophy on Data Integrity**: Many tools blindly drop extra columns or truncate data without warning. Structured Data Editor will **never** guess or risk corrupting your valuable dataset.

---

## 🏢 About AI Nexus

**Structured Data Editor** is developed and maintained by **[AI Nexus](https://ai-nexus.jp)**.

At AI Nexus, we build modern developer tooling, enterprise solutions, and AI workflows designed to elevate developer productivity and make high-quality software craftsmanship accessible.

- 🌐 **Website**: [https://ai-nexus.jp](https://ai-nexus.jp)
- 🐙 **GitHub**: [@ai-nexus-jp](https://github.com/ai-nexus-jp)
- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/ai-nexus-jp/vscode-structured-data-editor/issues)

If you find this extension helpful, please consider **leaving a ★★★★★ review on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ai-nexus-jp.vscode-structured-data-editor)** and starring the repository!

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
