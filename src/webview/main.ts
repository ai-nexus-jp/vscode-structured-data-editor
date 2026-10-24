import type { Alignment, TableData } from "../core/model";
import type { HostToWebview, WebviewToHost } from "../core/protocol";

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

function button(label: string, onClick: () => void, extra: { className?: string; title?: string } = {}) {
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
  // 短い列（IDやタグなど）は100〜160px、文章列は260〜450pxに配慮
  return Math.max(70, Math.min(480, maxLen * 10 + 32));
}

function render(): void {
  if (!state) return;
  const s = state;

  if (colWidths.length !== s.headers.length) {
    colWidths = s.headers.map((h, i) => calculateInitialColWidth(h, s.rows, i));
  }

  const status = el("span", {
    className: "status" + (isDirty() ? " dirty" : ""),
    textContent: isDirty() ? "● Unapplied changes" : "No changes",
  });

  // 行の高さ切り替えセレクトボックス
  const rowHeightSelect = el("select", { title: "Row Height", ariaLabel: "Row height mode" });
  [
    { val: "compact", label: "Compact Height" },
    { val: "comfortable", label: "Comfortable (Default)" },
    { val: "expanded", label: "Expanded (Read Long Text)" },
  ].forEach((opt) => {
    rowHeightSelect.append(el("option", { value: opt.val, textContent: opt.label, selected: rowHeightMode === opt.val }));
  });
  rowHeightSelect.addEventListener("change", () => {
    rowHeightMode = rowHeightSelect.value as "compact" | "comfortable" | "expanded";
    render();
  });

  const toolbar = el(
    "div",
    { className: "toolbar" },
    button("Apply", () => vscode.postMessage({ type: "apply", table: s }), { className: "primary" }),
    button("Cancel", () => vscode.postMessage({ type: "cancel" })),
    button("+ Row", () => {
      s.rows.push(s.headers.map(() => ""));
      render();
    }),
    button("+ Column", () => {
      s.headers.push(`Column ${s.headers.length + 1}`);
      s.alignments.push("none");
      s.rows.forEach((r) => r.push(""));
      colWidths.push(160);
      render();
    }),
    status,
    el("div", { className: "view-controls" }, el("label", {}, "View: ", rowHeightSelect)),
  );

  // thead & colgroup
  const colgroup = el("colgroup");
  const col0 = el("col");
  col0.style.width = "44px";
  colgroup.append(col0);

  colWidths.forEach((w) => {
    const colEl = el("col");
    colEl.style.width = `${w}px`;
    colgroup.append(colEl);
  });

  const headRow = el("tr", {}, el("th", { className: "corner", textContent: "#" }));
  s.headers.forEach((h, c) => {
    const headerInput = cellInput(h, `Header ${c + 1}`, (v) => (s.headers[c] = v), true);
    const align = el("select", { title: "Alignment", ariaLabel: `Alignment of column ${c + 1}` });
    (["none", "left", "center", "right"] as Alignment[]).forEach((a) =>
      align.append(el("option", { value: a, textContent: a, selected: s.alignments[c] === a })),
    );
    align.addEventListener("change", () => {
      s.alignments[c] = align.value as Alignment;
      updateStatus();
    });

    const del = button("✕", () => {
      if (s.headers.length <= 1) return;
      s.headers.splice(c, 1);
      s.alignments.splice(c, 1);
      s.rows.forEach((r) => r.splice(c, 1));
      colWidths.splice(c, 1);
      render();
    }, { className: "btn-del", title: "Delete column" });
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

    const colHeaderContent = el(
      "div",
      { className: "col-content" },
      headerInput,
      el("div", { className: "colctl" }, ...(format === "markdown" ? [align, del] : [del])),
    );

    headRow.append(el("th", { className: "col-header" }, colHeaderContent, resizer));
  });

  const body = s.rows.map((row, r) => {
    const tr = el("tr");
    const delRowBtn = button("✕", () => {
      s.rows.splice(r, 1);
      render();
    }, { className: "btn-del", title: "Delete row" });

    tr.append(
      el(
        "td",
        { className: "row-num" },
        el("div", { className: "rowctl" }, el("span", { className: "row-label", textContent: `${r + 1}` }), delRowBtn),
      ),
    );

    row.forEach((v, c) => {
      const input = cellInput(v, `Row ${r + 1}, column ${c + 1}`, (nv) => (row[c] = nv));
      tr.append(el("td", {}, el("div", { className: "cell-container" }, input)));
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
}

function cellInput(
  value: string,
  label: string,
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
      updateStatus();
    });
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
    updateStatus();
  });
  return textarea;
}

function updateStatus(): void {
  const st = app.querySelector(".status");
  if (!st) return;
  st.className = "status" + (isDirty() ? " dirty" : "");
  st.textContent = isDirty() ? "● Unapplied changes" : "No changes";
}

window.addEventListener("message", (event: MessageEvent<HostToWebview>) => {
  const m = event.data;
  if (m.type === "init") {
    state = structuredClone(m.table);
    format = m.format;
    initial = JSON.stringify(state);
    colWidths = [];
    banner = "";
    render();
  } else if (m.type === "conflict" || m.type === "error") {
    banner = m.message;
    render();
  }
});

vscode.postMessage({ type: "ready" });
