import * as vscode from "vscode";
import { EditSession, locateCsv, locateJson, locateTable, type StartResult } from "./commands/session";
import { UnsupportedTableError } from "./core/errors";
import { exportTable, FORMAT_EXTENSION, type Format } from "./formats/convert";
import type { HostToWebview } from "./core/protocol";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("structuredDataEditor.editTableVisually", () =>
      editTableVisually(context),
    ),
    vscode.commands.registerCommand("structuredDataEditor.exportAs", () => exportAs()),
  );
}

export function deactivate(): void {}

function locateForEditor(editor: vscode.TextEditor): StartResult {
  const document = editor.document;
  if (/\.(csv|tsv)$/i.test(document.fileName)) return locateCsv(document.getText(), document.fileName);
  if (/\.json$/i.test(document.fileName)) return locateJson(document.getText());
  if (document.languageId === "markdown") {
    return locateTable(document.getText(), editor.selection.active.line);
  }
  return { ok: false, message: "Open a Markdown, CSV/TSV or JSON file to edit a table." };
}

const FORMAT_LABEL: Record<Format, string> = { markdown: "Markdown", csv: "CSV", json: "JSON" };

async function exportAs(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Open a Markdown, CSV/TSV or JSON file to export a table.");
    return;
  }
  const source = locateForEditor(editor);
  if (!source.ok) {
    void vscode.window.showWarningMessage(source.message);
    return;
  }
  const from = source.target.format;
  const choice = await vscode.window.showQuickPick(
    (["markdown", "csv", "json"] as Format[])
      .filter((f) => f !== from)
      .map((f) => ({ label: FORMAT_LABEL[f], format: f })),
    { title: "Export table as…" },
  );
  if (!choice) return;

  let result;
  try {
    result = exportTable(source.target.data, from, choice.format);
  } catch (e) {
    if (e instanceof UnsupportedTableError) {
      void vscode.window.showErrorMessage(`Cannot export: ${e.message}`);
      return;
    }
    throw e;
  }

  const range =
    from === "markdown"
      ? `Markdown table at lines ${source.target.startLine + 1}-${source.target.endLine + 1}`
      : `Whole ${FORMAT_LABEL[from]} file`;
  const detail = [
    `Source: ${range}`,
    `Columns (in order): ${source.target.data.headers.join(", ")}`,
    `Rows: ${source.target.data.rows.length}`,
    ...(result.warnings.length ? ["", "Information may be lost or changed:", ...result.warnings.map((w) => `• ${w}`)] : []),
  ].join("\n");
  const go = await vscode.window.showWarningMessage(
    `Export as ${FORMAT_LABEL[choice.format]}?`,
    { modal: true, detail },
    "Choose destination…",
  );
  if (go === undefined) return;

  const ext = FORMAT_EXTENSION[choice.format];
  const base = editor.document.uri.with({ path: editor.document.uri.path.replace(/\.[^./]*$/, "") + "." + ext });
  const target = await vscode.window.showSaveDialog({
    defaultUri: base,
    filters: { [FORMAT_LABEL[choice.format]]: [ext] },
    title: "Export destination",
  });
  if (!target) return;
  if (target.toString() === editor.document.uri.toString()) {
    void vscode.window.showErrorMessage("Refusing to overwrite the source file. Choose a different destination.");
    return;
  }
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(result.content));
  void vscode.window.showInformationMessage(`Exported to ${vscode.workspace.asRelativePath(target)}`);
}

function editTableVisually(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Open a Markdown, CSV/TSV or JSON file to edit a table.");
    return;
  }
  const document = editor.document;
  const result = locateForEditor(editor);
  if (!result.ok) {
    if (result.line !== undefined) {
      const lineNum = result.line;
      void vscode.window.showErrorMessage(result.message, `Go to Line ${lineNum}`).then((action) => {
        if (action === `Go to Line ${lineNum}`) {
          const targetLine = Math.max(0, lineNum - 1);
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }
      });
    } else {
      void vscode.window.showWarningMessage(result.message);
    }
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "structuredDataEditor.table",
    `Edit Table: ${vscode.workspace.asRelativePath(document.uri)}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
    },
  );
  panel.webview.html = renderHtml(panel.webview, context.extensionUri);

  const session = new EditSession(result.target, {
    getText: () => (document.isClosed ? undefined : document.getText()),
    async replaceLines(startLine, endLine, newText) {
      const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, newText);
      return vscode.workspace.applyEdit(edit);
    },
    post: (m: HostToWebview) => void panel.webview.postMessage(m),
    close: () => panel.dispose(),
    notify(level, message) {
      const fn =
        level === "error"
          ? vscode.window.showErrorMessage
          : level === "warning"
            ? vscode.window.showWarningMessage
            : vscode.window.showInformationMessage;
      void fn(message);
    },
  });

  panel.webview.onDidReceiveMessage(
    (m: unknown) => void session.handleMessage(m),
    undefined,
    context.subscriptions,
  );
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--vscode-editor-background); }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
  
  #app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
    background: var(--vscode-editor-background);
  }

  button, select {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 2px;
    font: inherit;
  }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:disabled { opacity: .5; cursor: default; }

  .status { font-size: .9em; opacity: .85; margin-left: 4px; }
  .status.dirty { color: var(--vscode-editorWarning-foreground); opacity: 1; font-weight: bold; }
  .banner { color: var(--vscode-errorForeground); padding: 6px 12px; margin: 0; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  
  .view-controls { display: flex; align-items: center; gap: 6px; margin-left: auto; font-size: 0.85em; }
  .view-controls label { display: flex; align-items: center; gap: 4px; cursor: pointer; }

  /* スクロールエリア: flex: 1 1 0; min-height: 0; により親コンテナを超えて伸びるのを完全に防ぐ */
  .wrap {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    overflow: auto !important;
    position: relative;
    background: var(--vscode-editor-background);
  }

  /* スクロールバーの常時視認化 */
  .wrap::-webkit-scrollbar {
    width: 14px;
    height: 14px;
  }
  .wrap::-webkit-scrollbar-track {
    background: var(--vscode-scrollbarSlider-background, rgba(120, 120, 120, 0.15));
  }
  .wrap::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-hoverBackground, rgba(120, 120, 120, 0.6));
    border-radius: 4px;
    border: 2px solid var(--vscode-editor-background);
  }
  .wrap::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-activeBackground, rgba(120, 120, 120, 0.9));
  }
  .wrap::-webkit-scrollbar-corner {
    background: var(--vscode-editor-background);
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    width: max-content;
  }

  th, td {
    border-right: 1px solid var(--vscode-editorWidget-border, #454545);
    border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
    padding: 0;
    vertical-align: stretch;
    background: var(--vscode-editor-background);
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }

  th.corner, td.row-num {
    width: 44px;
    min-width: 44px;
    max-width: 44px;
    position: sticky;
    left: 0;
    z-index: 11;
    text-align: center;
    background: var(--vscode-editor-background);
  }
  thead th.corner {
    z-index: 12;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }

  th.col-header {
    position: relative;
    user-select: none;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .col-content {
    padding: 2px 4px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }
  input.cell {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    padding: 4px 6px;
    font: inherit;
    font-size: 13px;
    font-weight: bold;
    outline: none;
    text-overflow: ellipsis;
    border-radius: 0;
  }
  input.cell:focus {
    outline: 1px solid var(--vscode-focusBorder);
    background: var(--vscode-inputOption-activeBackground, rgba(255, 255, 255, 0.05));
  }
  .col-resizer {
    position: absolute;
    right: -4px;
    top: 0;
    bottom: 0;
    width: 9px;
    cursor: col-resize;
    user-select: none;
    z-index: 20;
  }
  .col-resizer:hover, .col-resizer.resizing {
    background: var(--vscode-focusBorder);
    opacity: 0.8;
  }

  .colctl, .rowctl { display: flex; gap: 4px; align-items: center; }
  .rowctl { justify-content: center; height: 100%; padding: 4px 0; }
  .row-label { font-size: 0.75em; opacity: 0.5; margin-right: 2px; }
  .btn-del { opacity: 0.5; padding: 2px 4px; font-size: 0.8em; line-height: 1; border: none; background: transparent; cursor: pointer; }
  .btn-del:hover { opacity: 1; color: var(--vscode-errorForeground); }

  .cell-container { width: 100%; height: 100%; box-sizing: border-box; display: flex; }
  textarea.cell {
    width: 100%;
    height: 100%;
    min-height: 52px;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    resize: vertical;
    overflow-y: auto;
    display: block;
    border-radius: 0;
  }
  td:hover textarea.cell {
    background: rgba(255, 255, 255, 0.02);
  }
  textarea.cell:focus {
    outline: 1px solid var(--vscode-focusBorder);
    background: var(--vscode-inputOption-activeBackground, var(--vscode-input-background));
  }
</style>
</head>
<body>
<div id="app" aria-live="polite">Loading…</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
