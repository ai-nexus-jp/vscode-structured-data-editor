# Changelog

## 0.2.0
- **Column Sorting**:
  - Sort rows ascending or descending (`↕` / `▲` / `▼`) directly from any column header, with numeric-aware comparison and empty cells placed at the bottom.
- **Grid Undo / Redo**:
  - Full table history support via toolbar buttons (`↶ Undo` / `↷ Redo`) and keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`, `Cmd+Z` / `Cmd+Shift+Z` on macOS).
- **Keyboard Navigation**:
  - Navigate smoothly across cells using `Tab` / `Shift+Tab`, `Enter` (move down; `Shift+Enter` for newline), and arrow keys (`ArrowUp/Down/Left/Right` at text boundaries or with `Ctrl`/`Alt`/`Cmd`).
- **Row & Column Reordering and Multi-Selection**:
  - Move rows (`↑` / `↓`) and columns (`◀` / `▶`) while keeping column widths and alignments synchronized.
  - Select multiple rows or columns via checkboxes (with `Shift+Click` range selection and Select All) for bulk deletion.

## 0.1.4
- **Enhanced Spreadsheet UX**:
  - Independent column resizing (resizing one column no longer shrinks others).
  - Row height toggle in toolbar (Compact, Comfortable, Expanded) for comfortable reading of multiline/AI-generated text.
  - Seamless dark-themed cell and header styling with clear grid borders.
  - Persistent bottom horizontal scrollbar that never gets pushed off-screen.
- **Improved CSV Diagnostics**:
  - Show exact source file line number on ragged/mismatched column errors.
  - Add "Go to Line X" notification action to jump directly to the issue.
- **Documentation**:
  - General user-focused README with Troubleshooting & FAQ.
  - Relocated developer instructions to CONTRIBUTING.md.
  - Official extension icon.

## 0.1.0
- Visual table editing for Markdown, CSV/TSV, and JSON (array of objects).
- Safe Apply/Cancel and source conflict detection.
- Export As... between formats with lossy conversion warnings.
