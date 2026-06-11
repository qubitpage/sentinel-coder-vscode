# Enterprise Code Audit Report

Date: 2026-06-11
Model/orchestrator: GPT-5.5
Scope: Sentinel Coder One Studio VS Code extension (`src`, `media`, metadata, docs, packaging workflow).

## Current security scan status

Initial targeted Sentinel firewall scans returned clean results for:

- `src/`
- `media/`
- `package.json`

No findings were reported by the built-in scanner at the time this report was created.

## What was hardened recently

- Webview `innerHTML` sinks in Studio and Sidebar were reduced/centralized or replaced with DOM/text rendering.
- Agentic model dropdowns use live model registry values instead of manual-only text entry.
- Web package includes `extensionWeb.ts` path and web manifest verification workflow.
- Tests cover Agentic profiles, model selector grouping, provider capability routing, web compatibility, and packaging assumptions.
- `.vscodeignore` excludes local scripts, tests, source scratch files, previous VSIXs, inspection folders, and local test workspaces.

## Hard critique

### 1. Too much functionality in large files

`sidebarProvider.ts` and `toolRegistry.ts` are large and carry many responsibilities. This increases regression risk and slows review.

Improvement:

- Split provider discovery, Agentic profiles, tool execution, context budgeting, and webview message handlers into focused modules.
- Add module-level tests for each.

### 2. Webview UI should move toward componentized rendering

`media/sidebar.js` is still a large imperative UI script. Even after hardening, long files make XSS regressions easier.

Improvement:

- Extract renderer helpers by feature: chat, settings, model selector, Agentic profiles, approvals, telemetry.
- Add DOM snapshot tests for dangerous strings.

### 3. Provider behavior changes quickly

Live model catalogs and supported parameters vary by provider and can break silently.

Improvement:

- Add provider contract fixtures.
- Cache provider metadata with timestamps.
- Expose a diagnostic export for provider discovery.

### 4. Full end-to-end VS Code UI testing is not yet enough

Static and package tests are useful, but real webview interactions should be automated.

Improvement:

- Add Playwright/Electron VS Code extension tests.
- Add vscode.dev/manual smoke checklist until browser automation is available.

### 5. Remote Tool Bridge needs a formal protocol spec

Web mode can be powerful only with a safe server-side bridge.

Improvement:

- Document bridge authentication, request schema, allowed operations, audit logs, rate limits, and deployment templates.

## Enterprise release criteria

A release should not be published unless:

- TypeScript compile passes.
- Regression tests pass.
- Desktop and web VSIXs build.
- Web manifest verification passes.
- Firewall scans are clean.
- Secret scans are clean.
- Archive inspection confirms no secrets/scratch/source test folders are packaged.
- Marketplace README clearly explains setup, provider keys, Web limits, contribution, and donation.
