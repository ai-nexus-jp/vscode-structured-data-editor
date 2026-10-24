# Product Backlog & Sprint 12 Planning

This document tracks upcoming feature implementations, bug fixes, and technical debt for the current sprint cycle.

## Sprint Goals
- Complete core data grid interactions and keyboard navigation.
- Improve file export stability across large documents.
- Prepare release notes and demo assets for v0.2.0.

---

## Task Management Board

Place your cursor anywhere inside the table below and run **`Structured Data Editor: Edit Table Visually`** to edit, sort, or add items.

| ID | Feature / Task | Assignee | Priority | Status | Est (pt) | Notes |
| :--- | :--- | :--- | :---: | :---: | --: | :--- |
| PROD-101 | Visual grid column resizing | Alice | High | Done | 5 | ドラッグによる列幅変更を実装 |
| PROD-102 | Keyboard shortcut (Tab / Enter navigation) | Bob | High | In Progress | 3 | スプレッドシート同様の移動操作 |
| PROD-103 | Markdown CJK character width calculation | Carol | High | Done | 5 | 全角日本語の罫線ズレ完全解消 |
| PROD-104 | CSV ragged row error detection | Dave | Medium | Done | 3 | 列数不整合時の安全アラート |
| PROD-105 | JSON type preservation (boolean/number) | Alice | High | Done | 5 | 保存時の型安全性を保証 |
| PROD-106 | Dark mode theme contrast optimization | Bob | Medium | In Progress | 2 | VS Code標準テーマと調和 |
| PROD-107 | Export As preview modal UI | Carol | High | Review | 5 | Markdown ↔ CSV ↔ JSON 変換プレビュー |
| PROD-108 | Undo / Redo history support | Dave | Medium | Todo | 8 | Cmd+Z によるセル変更の巻き戻し |
| PROD-109 | Right-click context menu (Insert row/col) | Alice | Medium | Todo | 3 | 行・列の任意位置挿入 |
| PROD-110 | TSV and custom delimiter auto-detection | Bob | Low | Review | 3 | タブ区切り・セミコロンの自動認識 |
| PROD-111 | Multiline cell editing in modal | Carol | Low | Todo | 5 | 改行を含む長文テキストの入力対応 |
| PROD-112 | Offline sandboxed CSP security check | Dave | High | Done | 2 | 外部通信遮断の安全監査完了 |
| PROD-113 | CI test workflow on macOS / Windows / Linux | Alice | Medium | Done | 3 | GitHub Actions による自動検証 |
| PROD-114 | Interactive demo video production | Bob | Medium | In Progress | 5 | 1分動画・ショート動画用の収録 |
| PROD-115 | Release v0.2.0 to Marketplace | Carol | High | Todo | 2 | ドキュメント更新とVSIXパッケージング |

---

## Code Reference Example

```typescript
export interface TaskItem {
  id: string;
  feature: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Todo' | 'In Progress' | 'Review' | 'Done';
  points: number;
  notes: string;
}
```

> **Note:** Only the table section is touched when applying edits. Headers, paragraphs, and code blocks above and below remain completely intact.

