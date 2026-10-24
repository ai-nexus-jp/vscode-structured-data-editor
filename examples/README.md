# Sample Data for Structured Data Editor

This directory contains realistic sample datasets designed for testing, demonstrations, and recording preview walkthroughs.

All data is fictional and safe for public use.

---

## Included Files

### 1. `sprint_backlog.md` (Markdown Table)
- **Use case:** Sprint planning, feature implementation roadmap, and task tracking.
- **Key demo highlights:**
  - In-place editing inside a rich Markdown document with headings, paragraphs, and code blocks.
  - Wide East Asian / CJK character width calculations that keep column alignment aligned when applied.
  - Cell status updates (`Todo` → `In Progress` → `Done`) and row insertions.
- **How to test:**
  1. Open `sprint_backlog.md`.
  2. Place cursor inside the **Task Management Board** table.
  3. Run command: **`Structured Data Editor: Edit Table Visually`**.
  4. Modify a cell or insert a row, then click **Apply**.

---

### 2. `customer_feedback.csv` (CSV File)
- **Use case:** User feedback, NPS reviews, and customer support tracking.
- **Key demo highlights:**
  - Robust handling of commas within quoted text (e.g. `"Austin, TX"`).
  - Multiline text, quotes, and international characters.
  - Safe editing without corrupting delimiter structure.
- **How to test:**
  1. Open `customer_feedback.csv`.
  2. Run command: **`Structured Data Editor: Edit Table Visually`**.
  3. Try editing scores, sorting, or adding new feedback rows.

---

### 3. `feature_flags.json` (JSON Array of Objects)
- **Use case:** SaaS feature toggles, rollout percentages, and configuration seeds.
- **Key demo highlights:**
  - Strict preservation of native JSON types (`boolean`, `number`, `string`, `null`).
  - Editing configuration lists as an intuitive spreadsheet instead of manual JSON syntax.
  - Seamless format conversion with **`Structured Data Editor: Export As...`** (e.g. JSON to Markdown table).
- **How to test:**
  1. Open `feature_flags.json`.
  2. Run command: **`Structured Data Editor: Edit Table Visually`**.
  3. Toggle `enabled` flags, change `rollout_percentage`, and click **Apply**.
  4. Run **`Structured Data Editor: Export As...`** to preview conversion to Markdown or CSV.

