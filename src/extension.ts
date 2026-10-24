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
    void vscode.window.showWarningMessage(result.message);
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
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  button, select { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); padding: 3px 8px; cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:disabled { opacity: .5; cursor: default; }
  .wrap { overflow-x: auto; max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 0; vertical-align: top; }
  th { background: var(--vscode-editor-inactiveSelectionBackground); }
  input.cell, textarea.cell { width: 100%; min-width: 8em; box-sizing: border-box; border: none; background: var(--vscode-input-background); color: var(--vscode-input-foreground); padding: 4px 6px; font: inherit; resize: vertical; }
  input.cell:focus, textarea.cell:focus { outline: 1px solid var(--vscode-focusBorder); }
  .colctl, .rowctl { display: flex; gap: 2px; padding: 2px; }
  .status { font-size: .9em; opacity: .85; }
  .status.dirty { color: var(--vscode-editorWarning-foreground); opacity: 1; }
  .banner { color: var(--vscode-errorForeground); margin: 8px 0; }
</style>
</head>
<body>
<div id="app" aria-live="polite">Loading…</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
