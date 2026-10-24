# Contributing to Structured Data Editor

Thank you for your interest in contributing to Structured Data Editor! This document contains instructions for setting up the development environment, running tests, and understanding the architecture.

## Development Setup

### Prerequisites
- Node.js >= 20
- npm >= 10

### Installation & Build
```bash
# Install dependencies
npm install

# Build extension and webview bundle into dist/
npm run build

# Watch mode for iterative development
npm run watch
```

### Running the Extension Locally
1. Open this repository in VS Code.
2. Press **F5** (launch configuration `"Run Extension"`).
3. An **Extension Development Host** window will open with the extension active.
4. Open any `.md`, `.csv`, `.tsv`, or `.json` file to test.

---

## Development Commands

| Command | Description |
| :--- | :--- |
| `npm run lint` | Runs ESLint on `src` and `test` directories |
| `npm run typecheck` | Runs TypeScript compiler checks (`tsc --noEmit`) |
| `npm test` | Runs all Vitest unit tests |
| `npm run build` | Bundles `src/extension.ts` and `src/webview/main.ts` with esbuild |
| `npm run vsix` | Runs typecheck, build, and packages the extension into a `.vsix` file |

Before submitting any Pull Request, ensure that all checks pass:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## Architecture Overview

- **`src/formats/`**: Format-specific parsers and serializers (Markdown, CSV, JSON) and conversion logic. Kept strictly free from `vscode` API dependencies for fast and isolated unit testing.
- **`src/core/`**: Shared data model (`TableData`), error definitions, and typed webview protocol message validators.
- **`src/commands/session.ts`**: Format-neutral editing session, conflict detection, and apply/cancel workflows abstracted behind a `SessionHost` interface.
- **`src/extension.ts`**: VS Code extension activation, command registrations, and webview panel lifecycle management.
- **`src/webview/main.ts`**: Lean, frameworkless TypeScript visual grid editor running in the sandboxed Webview context.

---

## Branching & Release Workflow

- **`main`**: Production and published code. Protected against direct pushes.
- **`develop`**: Active development branch. All feature branches and bugfixes should branch from and merge into `develop`.
- Pull Requests should target `develop`.
