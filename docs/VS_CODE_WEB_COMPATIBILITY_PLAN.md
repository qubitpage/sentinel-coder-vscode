# VS Code Web Compatibility Plan

Date: 2026-06-11
Version: 3.16.5

## Implemented now

- Added/kept a browser-safe activation file: `src/extensionWeb.ts`.
- Declared `browser: ./out/extensionWeb.js` in `package.json`.
- Declared browser-first `extensionKind: ["ui"]` for the web extension host.
- Added Web status/help commands.
- Kept Node-heavy desktop agent code behind the desktop `main` entry.
- Documented that full autonomous agent tools require VS Code Desktop.

## Why this split is necessary

The desktop Sentinel agent uses Node and OS capabilities: `fs`, `path`, `child_process`, local HTTP servers, terminals, SSH, Docker, local Ollama, MCP process servers, and media tooling. These are not available in the VS Code Web extension host. Loading that code directly in vscode.dev would fail or expose a broken UI.

## Future web-safe roadmap

1. Implement provider-only web chat with browser `fetch`.
2. Use `vscode.workspace.fs` for virtual-workspace-compatible file operations.
3. Add a web-safe tool registry that marks desktop-only actions as unavailable with clear explanations.
4. Add optional Azure-hosted RAG/context service for semantic codebase search in web mode.
5. Add remote execution connector for users who want terminal/SSH/Docker from web through an authenticated backend.

## Focus-safety note

All current `showTextDocument` calls now use `preserveFocus: true`, preventing agent-created previews/edits from stealing keyboard focus from the Sentinel chat input.


## Chat scroll-safety note

The webview chat now follows new output only when the user is already near the bottom. Manual scroll-up pins the viewport, and a **New output ↓** button lets the user return to the latest message on demand. This behavior is implemented in browser-safe webview JavaScript and applies to both desktop and web-compatible UI hosts.


## 3.16.3 Update - Configured-model dropdowns for Agentic Profiles

Agentic Profile model fields now use dropdown selectors backed by the configured model registry. Main/orchestrator and default worker are single-select controls; worker and reviewer pools are multi-select controls. This removes typo-prone manual model entry while preserving legacy saved IDs when a provider is temporarily unavailable.


## 3.16.4 Update - Automatic live provider context-window metadata

Sentinel now refreshes model context-window and max-output metadata from live provider model APIs where available (OpenRouter live catalog plus Azure/OpenAI-compatible `/models` endpoints for providers that expose metadata). When providers omit context fields, Sentinel uses transparent current-model heuristics for GPT-5.x/GPT-4.1/Gemini/Grok/Claude/frontier families and preserves known effective endpoint caps. Conversation budgeting uses this refreshed model metadata so large-context models keep more useful history while small-context models still summarize safely.


## 3.16.5 Update - Marketplace/Web installability fix

The extension now declares explicit limited `virtualWorkspaces` and `untrustedWorkspaces` support and registers web-safe placeholder providers for the contributed Chat and Studio webviews. The web entry imports only `vscode`, registers every contributed command with Desktop-required guidance, and avoids importing Node-only desktop agent modules. This is intended to prevent vscode.dev/github.dev from reporting “extension not available for the Web Platform” while still being honest that full autonomous tools require VS Code Desktop.
