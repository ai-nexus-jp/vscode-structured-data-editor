import type { Alignment, TableData } from "../core/model";
import type { HostToWebview, WebviewToHost } from "../core/protocol";

interface VsCodeApi {
  postMessage(m: WebviewToHost): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;

let state: TableData | null = null;
let initial = "";
let banner = "";
let format: "markdown" | "csv" | "json" = "markdown";

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

function render(): void {
  if (!state) return;
  const s = state;
  const status = el("span", {
    className: "status" + (isDirty() ? " dirty" : ""),
    textContent: isDirty() ? "● Unapplied changes" : "No changes",
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
      render();
    }),
    status,
  );

  const headRow = el("tr", {}, el("th"));
  s.headers.forEach((h, c) => {
    const input = cellInput(h, `Header ${c + 1}`, (v) => (s.headers[c] = v));
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
      render();
    }, { title: "Delete column" });
    del.disabled = s.headers.length <= 1;
    headRow.append(
      el("th", {}, input, el("div", { className: "colctl" }, ...(format === "markdown" ? [align, del] : [del]))),
    );
  });

  const body = s.rows.map((row, r) => {
    const tr = el("tr");
    tr.append(
      el(
        "td",
        {},
        el("div", { className: "rowctl" }, button("✕", () => {
          s.rows.splice(r, 1);
          render();
        }, { title: "Delete row" })),
      ),
    );
    row.forEach((v, c) =>
      tr.append(el("td", {}, cellInput(v, `Row ${r + 1}, column ${c + 1}`, (nv) => (row[c] = nv)))),
    );
    return tr;
  });

  const children: Node[] = [toolbar];
  if (banner) children.push(el("div", { className: "banner", role: "alert", textContent: banner }));
  children.push(
    el("div", { className: "wrap" }, el("table", {}, el("thead", {}, headRow), el("tbody", {}, ...body))),
  );
  app.replaceChildren(...children);
}

function cellInput(
  value: string,
  label: string,
  onChange: (v: string) => void,
): HTMLInputElement | HTMLTextAreaElement {
  // CSV cells may legitimately contain line breaks, so use a textarea there.
  const input =
    format === "csv"
      ? el("textarea", { className: "cell", rows: 1, value, ariaLabel: label })
      : el("input", { className: "cell", type: "text", value, ariaLabel: label });
  input.addEventListener("input", () => {
    onChange(input.value);
    updateStatus();
  });
  return input;
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
    banner = "";
    render();
  } else if (m.type === "conflict" || m.type === "error") {
    banner = m.message;
    render();
  }
});

vscode.postMessage({ type: "ready" });
