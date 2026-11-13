import type { Alignment, TableData } from "../core/model";
import type { HostToWebview, WebviewToHost } from "../core/protocol";
import {
  TableHistory,
  cloneTableData,
  deleteColumns,
  deleteRows,
  moveColumn,
  moveRow,
  sortRowsByColumn,
  type SortDirection,
} from "./tableOps";

interface VsCodeApi {
  postMessage(m: WebviewToHost): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;

let state: TableData | null = null;
let format: "markdown" | "csv" | "json" = "markdown";
let initial = "";
let banner = "";
let colWidths: number[] = [];
let rowHeightMode: "compact" | "comfortable" | "expanded" = "comfortable";

const history = new TableHistory(100);
const selectedRows = new Set<number>();
const selectedCols = new Set<number>();
let lastSelectedRow: number | null = null;
let lastSelectedCol: number | null = null;
let sortState: { colIndex: number; direction: SortDirection } | null = null;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let activeCellCoords: { row: number; col: number } | null = null;

let undoBtn: HTMLButtonElement | null = null;
let redoBtn: HTMLButtonElement | null = null;

const isDirty = () => state !== null && JSON.stringify(state) !== initial;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function button(
  label: string,
  onClick: (e: MouseEvent) => void,
  extra: { className?: string; title?: string; ariaLabel?: string } = {},
): HTMLButtonElement {
  const b = el("button", { type: "button", textContent: label, ...extra });
  b.addEventListener("click", onClick);
  return b;
}

function calculateInitialColWidth(header: string, rows: string[][], colIndex: number): number {
  let maxLen = header.length;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const val = rows[r]?.[colIndex] ?? "";
    const firstLine = val.split(/\r?\n/)[0] ?? "";
    if (firstLine.length > maxLen) {
      maxLen = firstLine.length;
    }
  }
  // Keep narrow ID/tag columns compact (70-160px) and text columns comfortable (up to 480px)
  return Math.max(84, Math.min(480, maxLen * 10 + 32));
}

function flushTypingCommit(): void {
  if (typingTimer !== undefined) {
    clearTimeout(typingTimer);
    typingTimer = undefined;
  }
  if (state && history.hasTableChangedFromCurrent(state)) {
    history.push(state, colWidths);
    updateHistoryButtons();
  }
}

function scheduleTypingCommit(): void {
  if (typingTimer !== undefined) {
    clearTimeout(typingTimer);
  }
  typingTimer = setTimeout(() => {
    typingTimer = undefined;
    if (state && history.hasTableChangedFromCurrent(state)) {
      history.push(state, colWidths);
      updateHistoryButtons();
    }
  }, 500);
}

function commitMutation(
  nextTable: TableData,
  options: { nextWidths?: number[]; clearSort?: boolean; focusTarget?: { row: number; col: number } } = {},
): void {
  flushTypingCommit();
  state = nextTable;
  if (options.nextWidths) {
    colWidths = options.nextWidths;
  }
  if (options.clearSort !== false) {
    sortState = null;
  }
  history.push(state, colWidths);
  render();
  if (options.focusTarget) {
    focusCell(options.focusTarget.row, options.focusTarget.col);
  }
}

function performUndo(restoreFocus: boolean): void {
  if (!state) return;
  flushTypingCommit();
  const snap = history.undo();
  if (!snap) return;
  state = snap.table;
  if (snap.colWidths.length === state.headers.length) {
    colWidths = snap.colWidths;
  }
  selectedRows.clear();
  selectedCols.clear();
  lastSelectedRow = null;
  lastSelectedCol = null;
  sortState = null;
  render();
  if (restoreFocus && activeCellCoords) {
    focusCell(activeCellCoords.row, activeCellCoords.col);
  }
}

function performRedo(restoreFocus: boolean): void {
  if (!state) return;
  flushTypingCommit();
  const snap = history.redo();
  if (!snap) return;
  state = snap.table;
  if (snap.colWidths.length === state.headers.length) {
    colWidths = snap.colWidths;
  }
  selectedRows.clear();
  selectedCols.clear();
  lastSelectedRow = null;
  lastSelectedCol = null;
  sortState = null;
  render();
  if (restoreFocus && activeCellCoords) {
    focusCell(activeCellCoords.row, activeCellCoords.col);
  }
}

function focusCell(row: number, col: number): void {
  if (!state || state.headers.length === 0) return;
  const clampedRow = Math.max(-1, Math.min(state.rows.length - 1, row));
  const clampedCol = Math.max(0, Math.min(state.headers.length - 1, col));
  const target = app.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-row="${clampedRow}"][data-col="${clampedCol}"]`,
  );
  if (!target) return;
  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function toggleSelectionRange(
  set: Set<number>,
  index: number,
  checked: boolean,
  shiftKey: boolean,
  anchor: number | null,
): number {
  if (shiftKey && anchor !== null) {
    const start = Math.min(anchor, index);
    const end = Math.max(anchor, index);
    for (let i = start; i <= end; i++) {
      if (checked) set.add(i);
      else set.delete(i);
    }
  } else {
    if (checked) set.add(index);
    else set.delete(index);
  }
  return index;
}

function remapSelectionOnMove(set: Set<number>, from: number, to: number): void {
  const next = new Set<number>();
  for (const idx of set) {
    if (idx === from) {
      next.add(to);
    } else if (from < to && idx > from && idx <= to) {
      next.add(idx - 1);
    } else if (from > to && idx >= to && idx < from) {
      next.add(idx + 1);
    } else {
      next.add(idx);
    }
  }
  set.clear();
  for (const idx of next) set.add(idx);
}

function updateHistoryButtons(): void {
  const canUndoNow = history.canUndo() || (state !== null && history.hasTableChangedFromCurrent(state));
  if (undoBtn) undoBtn.disabled = !canUndoNow;
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

function updateStatus(): void {
  const st = app.querySelector(".status");
  if (st) {
    st.className = "status" + (isDirty() ? " dirty" : "");
    st.textContent = isDirty() ? "● Unapplied changes" : "No changes";
  }
  updateHistoryButtons();
}

function render(): void {
  if (!state) return;
  const s = state;

  const prevWrap = app.querySelector<HTMLElement>(".wrap");
  const prevScrollTop = prevWrap?.scrollTop ?? 0;
  const prevScrollLeft = prevWrap?.scrollLeft ?? 0;

  if (colWidths.length !== s.headers.length) {
    colWidths = s.headers.map((h, i) => calculateInitialColWidth(h, s.rows, i));
  }

  // Prune out-of-range selections defensively
  for (const r of [...selectedRows]) {
    if (r < 0 || r >= s.rows.length) selectedRows.delete(r);
  }
  for (const c of [...selectedCols]) {
    if (c < 0 || c >= s.headers.length) selectedCols.delete(c);
  }

  const status = el("span", {
    className: "status" + (isDirty() ? " dirty" : ""),
    textContent: isDirty() ? "● Unapplied changes" : "No changes",
  });

  undoBtn = button("↶ Undo", () => performUndo(false), {
    title: "Undo (Ctrl+Z / Cmd+Z)",
    ariaLabel: "Undo",
  });
  redoBtn = button("↷ Redo", () => performRedo(false), {
    title: "Redo (Ctrl+Y / Cmd+Shift+Z)",
    ariaLabel: "Redo",
  });
  updateHistoryButtons();

  // 行の高さ切り替えセレクトボックス
  const rowHeightSelect = el("select", { title: "Row Height", ariaLabel: "Row height mode" });
  [
    { val: "compact", label: "Compact Height" },
    { val: "comfortable", label: "Comfortable (Default)" },
    { val: "expanded", label: "Expanded (Read Long Text)" },
  ].forEach((opt) => {
    rowHeightSelect.append(
      el("option", { value: opt.val, textContent: opt.label, selected: rowHeightMode === opt.val }),
    );
  });
  rowHeightSelect.addEventListener("change", () => {
    rowHeightMode = rowHeightSelect.value as "compact" | "comfortable" | "expanded";
    render();
  });

  const toolbarItems: (Node | string)[] = [
    button(
      "Apply",
      () => {
        flushTypingCommit();
        if (state) vscode.postMessage({ type: "apply", table: state });
      },
      { className: "primary" },
    ),
    button("Cancel", () => vscode.postMessage({ type: "cancel" })),
    el("span", { className: "toolbar-sep" }),
    undoBtn,
    redoBtn,
    el("span", { className: "toolbar-sep" }),
    button("+ Row", () => {
      const next = cloneTableData(s);
      const newRowIndex = next.rows.length;
      next.rows.push(next.headers.map(() => ""));
      commitMutation(next, { focusTarget: { row: newRowIndex, col: 0 } });
    }),
    button("+ Column", () => {
      const next = cloneTableData(s);
      const newColIndex = next.headers.length;
      next.headers.push(`Column ${newColIndex + 1}`);
      next.alignments.push("none");
      next.rows.forEach((r) => r.push(""));
      const nextWidths = [...colWidths, 160];
      commitMutation(next, { nextWidths, focusTarget: { row: -1, col: newColIndex } });
    }),
  ];

  if (selectedRows.size > 0) {
    const count = selectedRows.size;
    toolbarItems.push(
      button(
        `Delete ${count} Row${count > 1 ? "s" : ""}`,
        () => {
          const next = deleteRows(s, selectedRows);
          selectedRows.clear();
          lastSelectedRow = null;
          commitMutation(next);
        },
        { className: "danger", title: "Delete selected rows" },
      ),
    );
  }

  if (selectedCols.size > 0) {
    const count = selectedCols.size;
    const allSelected = count >= s.headers.length;
    const delColsBtn = button(
      `Delete ${count} Col${count > 1 ? "s" : ""}`,
      () => {
        const res = deleteColumns(s, selectedCols, colWidths);
        selectedCols.clear();
        lastSelectedCol = null;
        commitMutation(res.table, { nextWidths: res.colWidths });
      },
      {
        className: "danger",
        title: allSelected ? "At least one column must remain" : "Delete selected columns",
      },
    );
    delColsBtn.disabled = allSelected;
    toolbarItems.push(delColsBtn);
  }

  toolbarItems.push(status, el("div", { className: "view-controls" }, el("label", {}, "View: ", rowHeightSelect)));

  const toolbar = el("div", { className: "toolbar" }, ...toolbarItems);

  // thead & colgroup
  const colgroup = el("colgroup");
  const col0 = el("col");
  col0.style.width = "82px";
  colgroup.append(col0);

  colWidths.forEach((w) => {
    const colEl = el("col");
    colEl.style.width = `${w}px`;
    colgroup.append(colEl);
  });

  const allRowsSelected = s.rows.length > 0 && selectedRows.size === s.rows.length;
  const selectAllRowsCb = el("input", {
    type: "checkbox",
    className: "sel-cb",
    checked: allRowsSelected,
    disabled: s.rows.length === 0,
    title: "Select all rows",
    ariaLabel: "Select all rows",
  });
  selectAllRowsCb.indeterminate = selectedRows.size > 0 && selectedRows.size < s.rows.length;
  selectAllRowsCb.addEventListener("change", () => {
    if (selectAllRowsCb.checked) {
      for (let i = 0; i < s.rows.length; i++) selectedRows.add(i);
    } else {
      selectedRows.clear();
    }
    lastSelectedRow = null;
    render();
  });

  const headRow = el(
    "tr",
    {},
    el("th", { className: "corner" }, el("div", { className: "corner-inner" }, selectAllRowsCb, "#")),
  );

  s.headers.forEach((h, c) => {
    const isColSelected = selectedCols.has(c);
    const headerInput = cellInput(
      h,
      `Header ${c + 1}`,
      -1,
      c,
      (v) => {
        s.headers[c] = v;
      },
      true,
    );

    const colCb = el("input", {
      type: "checkbox",
      className: "sel-cb",
      checked: isColSelected,
      title: "Select column (Shift+Click for range)",
      ariaLabel: `Select column ${c + 1}`,
    });
    colCb.addEventListener("click", (e) => {
      lastSelectedCol = toggleSelectionRange(
        selectedCols,
        c,
        colCb.checked,
        e.shiftKey,
        lastSelectedCol,
      );
      render();
    });

    const isSortedCol = sortState?.colIndex === c;
    const nextDir: SortDirection =
      isSortedCol && sortState?.direction === "asc" ? "desc" : "asc";
    const sortIcon = isSortedCol ? (sortState?.direction === "asc" ? "▲" : "▼") : "↕";
    const sortTitle = isSortedCol
      ? `Sorted ${sortState?.direction === "asc" ? "ascending" : "descending"} (click to sort ${nextDir === "asc" ? "ascending" : "descending"})`
      : "Sort column ascending";

    const sortBtn = button(
      sortIcon,
      () => {
        flushTypingCommit();
        const sorted = sortRowsByColumn(s, c, nextDir);
        sortState = { colIndex: c, direction: nextDir };
        selectedRows.clear();
        lastSelectedRow = null;
        commitMutation(sorted, { clearSort: false });
      },
      {
        className: "btn-ctl sort-btn" + (isSortedCol ? " active" : ""),
        title: sortTitle,
        ariaLabel: `Sort column ${c + 1}`,
      },
    );

    const moveLeftBtn = button(
      "◀",
      () => {
        const res = moveColumn(s, c, c - 1, colWidths);
        remapSelectionOnMove(selectedCols, c, c - 1);
        if (sortState) {
          if (sortState.colIndex === c) sortState.colIndex = c - 1;
          else if (sortState.colIndex === c - 1) sortState.colIndex = c;
        }
        commitMutation(res.table, { nextWidths: res.colWidths, clearSort: false });
      },
      { className: "btn-ctl", title: "Move column left", ariaLabel: `Move column ${c + 1} left` },
    );
    moveLeftBtn.disabled = c === 0;

    const moveRightBtn = button(
      "▶",
      () => {
        const res = moveColumn(s, c, c + 1, colWidths);
        remapSelectionOnMove(selectedCols, c, c + 1);
        if (sortState) {
          if (sortState.colIndex === c) sortState.colIndex = c + 1;
          else if (sortState.colIndex === c + 1) sortState.colIndex = c;
        }
        commitMutation(res.table, { nextWidths: res.colWidths, clearSort: false });
      },
      { className: "btn-ctl", title: "Move column right", ariaLabel: `Move column ${c + 1} right` },
    );
    moveRightBtn.disabled = c === s.headers.length - 1;

    const align = el("select", { title: "Alignment", ariaLabel: `Alignment of column ${c + 1}` });
    (["none", "left", "center", "right"] as Alignment[]).forEach((a) =>
      align.append(el("option", { value: a, textContent: a, selected: s.alignments[c] === a })),
    );
    align.addEventListener("change", () => {
      const next = cloneTableData(s);
      next.alignments[c] = align.value as Alignment;
      commitMutation(next, { clearSort: false });
    });

    const del = button(
      "✕",
      () => {
        if (s.headers.length <= 1) return;
        const res = deleteColumns(s, new Set([c]), colWidths);
        selectedCols.clear();
        lastSelectedCol = null;
        commitMutation(res.table, { nextWidths: res.colWidths });
      },
      { className: "btn-del", title: "Delete column", ariaLabel: `Delete column ${c + 1}` },
    );
    del.disabled = s.headers.length <= 1;

    // 列幅リサイズ用ハンドル (他列に影響を与えず単独で幅を変更)
    const resizer = el("div", { className: "col-resizer" });
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      resizer.classList.add("resizing");
      const startX = e.clientX;
      const startWidth = colWidths[c] ?? 160;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(40, startWidth + delta);
        colWidths[c] = newWidth;
        const colEl = colgroup.children[c + 1] as HTMLElement;
        if (colEl) {
          colEl.style.width = `${newWidth}px`;
        }
      };

      const onMouseUp = () => {
        resizer.classList.remove("resizing");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    const colControls: HTMLElement[] = [colCb, sortBtn, moveLeftBtn, moveRightBtn];
    if (format === "markdown") colControls.push(align);
    colControls.push(del);

    const colHeaderContent = el(
      "div",
      { className: "col-content" },
      headerInput,
      el("div", { className: "colctl" }, ...colControls),
    );

    headRow.append(
      el(
        "th",
        { className: "col-header" + (isColSelected ? " col-selected" : "") },
        colHeaderContent,
        resizer,
      ),
    );
  });

  const body = s.rows.map((row, r) => {
    const isRowSelected = selectedRows.has(r);
    const tr = el("tr", { className: isRowSelected ? "row-selected" : "" });

    const rowCb = el("input", {
      type: "checkbox",
      className: "sel-cb",
      checked: isRowSelected,
      title: "Select row (Shift+Click for range)",
      ariaLabel: `Select row ${r + 1}`,
    });
    rowCb.addEventListener("click", (e) => {
      lastSelectedRow = toggleSelectionRange(
        selectedRows,
        r,
        rowCb.checked,
        e.shiftKey,
        lastSelectedRow,
      );
      render();
    });

    const moveUpBtn = button(
      "↑",
      () => {
        const next = moveRow(s, r, r - 1);
        remapSelectionOnMove(selectedRows, r, r - 1);
        commitMutation(next);
      },
      { className: "btn-ctl", title: "Move row up", ariaLabel: `Move row ${r + 1} up` },
    );
    moveUpBtn.disabled = r === 0;

    const moveDownBtn = button(
      "↓",
      () => {
        const next = moveRow(s, r, r + 1);
        remapSelectionOnMove(selectedRows, r, r + 1);
        commitMutation(next);
      },
      { className: "btn-ctl", title: "Move row down", ariaLabel: `Move row ${r + 1} down` },
    );
    moveDownBtn.disabled = r === s.rows.length - 1;

    const delRowBtn = button(
      "✕",
      () => {
        const next = deleteRows(s, new Set([r]));
        selectedRows.clear();
        lastSelectedRow = null;
        commitMutation(next);
      },
      { className: "btn-del", title: "Delete row", ariaLabel: `Delete row ${r + 1}` },
    );

    tr.append(
      el(
        "td",
        { className: "row-num" },
        el(
          "div",
          { className: "rowctl" },
          el("div", { className: "rowctl-top" }, rowCb, el("span", { className: "row-label", textContent: `${r + 1}` })),
          el("div", { className: "rowctl-actions" }, moveUpBtn, moveDownBtn, delRowBtn),
        ),
      ),
    );

    row.forEach((v, c) => {
      const input = cellInput(v, `Row ${r + 1}, column ${c + 1}`, r, c, (nv) => {
        row[c] = nv;
      });
      tr.append(
        el(
          "td",
          { className: selectedCols.has(c) ? "col-selected" : "" },
          el("div", { className: "cell-container" }, input),
        ),
      );
    });
    return tr;
  });

  // 右端に操作用のパディングセルを追加して最後の列を広げやすくする
  const endTh = el("th");
  endTh.style.width = "60px";
  endTh.style.minWidth = "60px";
  endTh.style.background = "transparent";
  endTh.style.border = "none";
  headRow.append(endTh);

  body.forEach((tr) => {
    const endTd = el("td");
    endTd.style.width = "60px";
    endTd.style.minWidth = "60px";
    endTd.style.background = "transparent";
    endTd.style.border = "none";
    tr.append(endTd);
  });

  const table = el("table", {}, colgroup, el("thead", {}, headRow), el("tbody", {}, ...body));
  const wrap = el("div", { className: "wrap" }, table);

  const children: Node[] = [toolbar];
  if (banner) children.push(el("div", { className: "banner", role: "alert", textContent: banner }));
  children.push(wrap);

  app.replaceChildren(...children);
  wrap.scrollTop = prevScrollTop;
  wrap.scrollLeft = prevScrollLeft;
}

function attachCellNavigation(
  inputEl: HTMLInputElement | HTMLTextAreaElement,
  row: number,
  col: number,
): void {
  inputEl.dataset.row = String(row);
  inputEl.dataset.col = String(col);

  inputEl.addEventListener("focus", () => {
    activeCellCoords = { row, col };
  });

  inputEl.addEventListener("blur", () => {
    flushTypingCommit();
  });

  (inputEl as HTMLElement).addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.isComposing || !state) return;

    const totalRows = state.rows.length;
    const totalCols = state.headers.length;

    if (e.key === "Tab") {
      e.preventDefault();
      let nextRow = row;
      let nextCol = col + (e.shiftKey ? -1 : 1);
      if (nextCol >= totalCols) {
        if (nextRow + 1 < totalRows) {
          nextRow += 1;
          nextCol = 0;
        } else {
          nextCol = totalCols - 1;
        }
      } else if (nextCol < 0) {
        if (nextRow > -1) {
          nextRow -= 1;
          nextCol = totalCols - 1;
        } else {
          nextCol = 0;
        }
      }
      focusCell(nextRow, nextCol);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (row + 1 < totalRows) {
        focusCell(row + 1, col);
      }
      return;
    }

    if (e.key === "Escape") {
      inputEl.blur();
      return;
    }

    const forceMove = (e.ctrlKey || e.altKey || e.metaKey) && !e.shiftKey;
    const selStart = inputEl.selectionStart ?? 0;
    const selEnd = inputEl.selectionEnd ?? 0;
    const len = inputEl.value.length;

    if (e.key === "ArrowUp") {
      if ((forceMove || (selStart === 0 && selEnd === 0)) && row > -1) {
        e.preventDefault();
        focusCell(row - 1, col);
      }
    } else if (e.key === "ArrowDown") {
      if ((forceMove || (selStart === len && selEnd === len)) && row + 1 < totalRows) {
        e.preventDefault();
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowLeft") {
      if ((forceMove || (selStart === 0 && selEnd === 0)) && col > 0) {
        e.preventDefault();
        focusCell(row, col - 1);
      }
    } else if (e.key === "ArrowRight") {
      if ((forceMove || (selStart === len && selEnd === len)) && col + 1 < totalCols) {
        e.preventDefault();
        focusCell(row, col + 1);
      }
    }
  });
}

function cellInput(
  value: string,
  label: string,
  row: number,
  col: number,
  onChange: (v: string) => void,
  isHeader = false,
): HTMLInputElement | HTMLTextAreaElement {
  if (isHeader) {
    const input = el("input", {
      className: "cell",
      type: "text",
      value,
      ariaLabel: label,
    });
    input.addEventListener("input", () => {
      onChange(input.value);
      sortState = null;
      scheduleTypingCommit();
      updateStatus();
    });
    attachCellNavigation(input, row, col);
    return input;
  }

  const textarea = el("textarea", {
    className: "cell",
    value,
    ariaLabel: label,
  });

  // モードに応じた縦幅（高さ）設定
  if (rowHeightMode === "compact") {
    textarea.style.minHeight = "28px";
    textarea.rows = 1;
  } else if (rowHeightMode === "expanded") {
    textarea.style.minHeight = "120px";
    textarea.rows = 6;
  } else {
    // comfortable (default): 文章の長さに応じて2〜5行分に自動拡張
    const lineCount = value.split(/\r?\n/).length || 1;
    const estLines = Math.max(lineCount, Math.ceil(value.length / 30));
    const targetRows = Math.min(Math.max(estLines, 2), 5);
    textarea.rows = targetRows;
    textarea.style.minHeight = `${targetRows * 24}px`;
  }

  textarea.addEventListener("input", () => {
    onChange(textarea.value);
    sortState = null;
    scheduleTypingCommit();
    updateStatus();
  });
  attachCellNavigation(textarea, row, col);
  return textarea;
}

window.addEventListener("keydown", (e) => {
  if (e.isComposing || !state) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === "z") {
    e.preventDefault();
    if (e.shiftKey) performRedo(true);
    else performUndo(true);
  } else if (key === "y" && !e.shiftKey) {
    e.preventDefault();
    performRedo(true);
  }
});

window.addEventListener("message", (event: MessageEvent<HostToWebview>) => {
  const m = event.data;
  if (m.type === "init") {
    state = cloneTableData(m.table);
    format = m.format;
    initial = JSON.stringify(state);
    colWidths = state.headers.map((h, i) => calculateInitialColWidth(h, state!.rows, i));
    history.reset(state, colWidths);
    selectedRows.clear();
    selectedCols.clear();
    lastSelectedRow = null;
    lastSelectedCol = null;
    sortState = null;
    activeCellCoords = null;
    banner = "";
    render();
  } else if (m.type === "conflict" || m.type === "error") {
    banner = m.message;
    render();
  }
});

vscode.postMessage({ type: "ready" });
