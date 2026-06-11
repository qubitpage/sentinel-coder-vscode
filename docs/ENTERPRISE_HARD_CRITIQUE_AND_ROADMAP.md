# Enterprise Hard Critique and Improvement Roadmap

This document is intentionally critical. Sentinel Coder One Studio is powerful, but enterprise reliability requires continuous hardening, smaller reviewable modules, stronger automated UI tests, and formal release gates.

Status: updated for 3.16.18.

---

## 1. Hard critique

### 1.1 Too much functionality still lives in large files

`src/sidebarProvider.ts` and `src/toolRegistry.ts` carry too many responsibilities: provider discovery, Agentic profile orchestration, tool execution, context budgeting, webview message routing, terminal/session management, media helpers, and release-facing logic. Large files increase regression risk, make code review slower, and hide security-sensitive behavior in long imperative flows.

Improvement plan:

- Split provider discovery into focused modules such as `providers/discovery`, `providers/capabilities`, and `providers/contextWindows`.
- Split Agentic Profiles into `agentic/profileStore`, `agentic/profileRuntime`, `agentic/preflight`, and `agentic/fallbacks`.
- Split tool execution into `tools/terminalSessions`, `tools/remoteWorkspace`, `tools/webBridge`, `tools/media`, and `tools/security`.
- Split context budgeting into a dedicated `context/budget`, `context/summarizer`, and `context/hashCache` layer.
- Move webview message handlers into feature-specific controllers.
- Add module-level tests for each extracted module before continuing large feature work.

### 1.2 Webview UI should move toward componentized rendering

`media/sidebar.js` remains a large imperative UI script. Even with escaping helpers and safer DOM handling, long UI scripts make XSS regressions easier and make Agentic/profile/settings changes harder to test.

Improvement plan:

- Extract renderer helpers by feature:
  - chat transcript and streaming
  - settings forms
  - categorized model selector
  - Agentic profile editor
  - approvals and follow-up queue
  - telemetry/status footer
  - Studio/media controls
- Prefer small pure rendering functions that accept data and return DOM nodes.
- Add DOM snapshot tests for dangerous strings, HTML-like model names, provider labels, profile names, and tool output.
- Add negative tests proving untrusted text lands in `textContent` or escaped attributes, not raw `innerHTML`.
- Keep one auditable sanitized Markdown/HTML path for intentional rich output.

### 1.3 Provider behavior changes quickly and can break silently

Live model catalogs, context windows, supported request parameters, tool-calling formats, and rate-limit behavior vary by provider and can change without warning. Dynamic discovery is necessary, but it also needs contract tests and user-visible diagnostics.

Improvement plan:

- Add provider contract fixtures for Azure OpenAI/Foundry, OpenAI-compatible `/models`, OpenRouter, Groq, Anthropic-style APIs, Ollama, and local/offline failure modes.
- Cache provider metadata with timestamps, source labels, and expiry policy.
- Show whether a model came from live discovery, cached discovery, or curated fallback.
- Expose a diagnostic export command that includes sanitized provider discovery results, selected model metadata, context windows, and capability decisions.
- Add tests that verify unsupported parameters are removed before requests are sent.
- Add rate-limit behavior tests so one 429 worker cannot collapse the whole Agentic workflow.

### 1.4 Full end-to-end VS Code UI testing is not yet enough

Static tests, package inspection, and TypeScript compile are necessary but not sufficient. Real user failures often happen in the webview: changing settings, selecting models, editing Agentic profiles, adding follow-up requests while a job is running, scrolling during streaming, and using Studio controls.

Improvement plan:

- Add VS Code Extension Test Runner tests for activation, command registration, and webview provider creation.
- Add Playwright/Electron VS Code extension tests for the sidebar UI once the webview is componentized enough to test reliably.
- Automate smoke flows:
  - normal single-model chat
  - Agentic profile chat
  - model dropdown refresh
  - Agentic add/remove worker and reviewer models
  - add follow-up while running
  - Studio open/refresh
  - web compatibility status command
  - remote workspace command routing
- Keep a `vscode.dev` manual smoke checklist until browser automation is available.

### 1.5 Remote Tool Bridge needs a formal protocol spec

Web mode can be powerful only with a safe server-side bridge or a trusted VS Code Remote/Codespaces/Dev Tunnel host. A browser tab cannot safely run local shells, SSH, Docker, local Ollama, native MCP servers, or media binaries by itself. Sentinel must avoid pretending these are local browser capabilities while still offering a strong remote execution path.

Improvement plan:

- Publish a formal Remote Tool Bridge protocol spec covering:
  - authentication and token storage
  - request schema
  - response schema
  - allowed operations
  - workspace/path allowlists
  - command allowlists and deny rules
  - audit log fields
  - rate limits and concurrency limits
  - timeout behavior
  - approval requirements
  - error codes
- Add deployment templates for Azure App Service/Container Apps and private enterprise networks.
- Add a hardened reference bridge server with tests and minimal privileges.
- Document when to prefer VS Code Remote SSH/Codespaces/Dev Tunnels over the bridge.

### 1.6 Cost controls need more UX and enforcement

Context budgets and model-usage telemetry are important, but users still need clearer per-turn cost estimates, profile-level spend simulation, and warnings before large premium-model contexts.

Improvement plan:

- Add per-turn approximate cost telemetry when provider pricing is known.
- Add profile spend forecasts before Agentic runs.
- Add explicit confirmation for premium models over a configured context threshold.
- Add policy-level max context budgets per model/provider/profile.
- Add a weekly model-spend report export.

### 1.7 Security scanning should become CI-gated

Manual scans and local archive inspection helped, but enterprise release safety should not depend on a single operator remembering every check.

Improvement plan:

- Add CI for TypeScript compile, regression tests, web manifest verification, packaging, archive inspection, secret scans, and webview sink scans.
- Fail CI if `.vscodeignore` allows `src/`, `tests/`, `scripts/`, `_inspect*/`, VSIX artifacts, scratch files, or secret-like files into the package.
- Add a required release checklist artifact to each GitHub release.

### 1.8 Accessibility and usability need formal audits

The grouped model selector, settings, Agentic profile editor, Studio, chat transcript, and follow-up controls should be tested with keyboard-only navigation, screen readers, high-contrast themes, and reduced motion.

Improvement plan:

- Add keyboard navigation tests for all controls.
- Add ARIA labels for dynamic buttons and status regions.
- Add high-contrast screenshots to release QA.
- Avoid color-only state indicators.

### 1.9 Documentation must stay versioned and non-duplicated

The extension moves quickly. Duplicate guides, obsolete release notes, and encoding issues make GitHub and Marketplace pages look less professional and can mislead users.

Improvement plan:

- Keep `README.md`, `CHANGELOG.md`, and `docs/README.md` as the canonical public entry points.
- Remove or redirect duplicate documents when a canonical guide replaces them.
- Use ASCII-safe Marketplace-facing text unless the rendering pipeline is proven safe.
- Add link checks and mojibake checks to release gates.

---

## 2. Enterprise release criteria

A Sentinel Coder One Studio release must not be published unless all of the following are true. These gates are intentionally strict because the extension can execute tools, render webviews, route requests to paid providers, and publish web-compatible artifacts.

### 2.1 Required technical gates

1. TypeScript compile passes with exit code 0.
2. Regression tests pass with exit code 0.
3. Desktop VSIX builds successfully from the current workspace.
4. Web VSIX builds successfully from the current workspace.
5. Web manifest verification passes against the fresh web VSIX.
6. Firewall scans are clean for `README.md`, `CHANGELOG.md`, `package.json`, `media/`, `out/`, and `docs/`.
7. Secret scans are clean for source, public docs, packaged output, and unpacked VSIX contents.
8. Archive inspection confirms no secrets, scratch files, unpacked inspection folders, root loose scripts, `src/`, `tests/`, or `scripts/` are packaged.
9. `.vscodeignore` excludes VSIX files, ZIPs, `_inspect*/`, temporary scripts, source tests, and local key material.
10. Marketplace README clearly explains setup, provider keys, VS Code Web limits, Remote Workspace/Remote Tool Bridge behavior, contribution links, and donation/community links.

### 2.2 Required functional smoke gates

Before publishing, verify at minimum:

- Single-model chat stays direct and does not accidentally trigger Agentic orchestration.
- Agentic profile chat triggers the selected profile, worker/reviewer preflight, fallback behavior, and model-usage telemetry.
- Settings profile editor uses live dropdowns for orchestrator, worker, and reviewer models.
- Categorized model selector shows Agentic Modes, Most used models and modes, then provider groups with free/free-tier models before paid models.
- Provider discovery degrades gracefully when a key is missing, a provider is offline, or a provider returns an unexpected catalog shape.
- Context budgeting prevents accidental high-cost 1M-token requests unless explicitly configured.
- `runCommand` supports multiple named sessions and enforces memory/session guardrails.
- `remoteWorkspaceCommand` works only in an already-authenticated VS Code Remote/Codespaces/Dev Container/WSL/Tunnel context and does not ask for private keys.
- Browser/web mode explains unavailable local-native operations and points users to VS Code Remote or the HTTPS Remote Tool Bridge.
- Studio opens, refreshes, and renders generated image/audio/video/document assets without unsafe HTML regressions.

### 2.3 Required documentation gates

Before publishing, verify:

- `README.md` is ASCII-safe for GitHub and Marketplace rendering.
- `CHANGELOG.md` contains the new version and no mojibake.
- `docs/README.md` points to one canonical guide per topic.
- Duplicate historical docs are removed or clearly marked as archived.
- Security, release, remote bridge, provider setup, Agentic profiles, Studio/media, enterprise operations, donation/community, and contribution docs are linked from the public docs hub.
- Manual `vscode.dev` smoke-check instructions are present until browser automation is complete.

---

## 3. Refactor roadmap

### Phase 1: make high-risk boundaries testable

- Extract provider discovery/capability/context-window logic behind pure functions and fixtures.
- Extract Agentic profile selection, fallback, and preflight into testable modules.
- Extract terminal session management and resource guardrails into a focused tool-runtime module.
- Add tests for unsupported provider parameters, rate limits, and missing credentials.

### Phase 2: reduce webview risk

- Move large imperative rendering blocks from `media/sidebar.js` into feature-specific rendering helpers.
- Add DOM/XSS snapshot tests for dangerous provider/model/profile/tool-output strings.
- Introduce a small webview test harness that runs without a full VS Code window.
- Keep one audited sanitized Markdown path for intentional rich content.

### Phase 3: add real UI automation

- Add VS Code Extension Test Runner coverage for activation, commands, webviews, and settings.
- Add Playwright/Electron flows for model selection, profile editing, chat streaming, follow-up queueing, Studio, and remote status messaging.
- Maintain a manual `vscode.dev` checklist until web automation is stable.

### Phase 4: formalize remote/web execution

- Publish the Remote Tool Bridge protocol spec.
- Add reference bridge deployment templates.
- Add bridge audit log and rate-limit tests.
- Add enterprise policy controls for allowed operations and path/command allowlists.

### Phase 5: CI-gate releases

- Move the release checklist into CI so a release cannot be cut from an unverified tree.
- Require package archive hygiene, secret scans, mojibake scans, and web manifest verification in CI.
- Attach a release checklist artifact to every GitHub release.

---

## 4. Bottom line

Sentinel Coder One Studio has the right product direction: single-model maximum capability when the user chooses a normal model, opt-in Agentic orchestration when a profile is selected, live provider discovery, media/document Studio, remote-workspace tooling, and VS Code Web support. The enterprise-grade gap is not feature ambition; it is maintainability and verification depth.

The priority is to reduce large-file blast radius, componentize the webview, turn provider volatility into contract-tested fixtures, formalize remote web execution, and enforce every release criterion automatically before GitHub or Marketplace publication.
ewall scans are clean for Marketplace-facing files and docs.
7. Secret scans are clean for source, docs, media, compiled output, and unpacked VSIX contents.
8. Archive inspection confirms no secrets, scratch files, source trees, tests, scripts, `_inspect*/` folders, temporary files, or generated declarations are packaged unintentionally.
9. Marketplace README clearly explains setup, provider keys, VS Code Web limits, Remote Tool Bridge strategy, contribution links, support, and donation.
10. Public docs have no duplicate/stale links and no mojibake-prone characters in the landing page.
11. GitHub state is committed and pushed before or immediately after Marketplace publish.
12. Marketplace/version visibility is checked after publish, allowing for index/cache delay.

---

## 3. Priority backlog

### P0 - release safety

- Add CI workflow for compile, tests, web manifest verification, package inspection, secret scan, and link/mojibake checks.
- Add a script that fails on forbidden files inside VSIX artifacts.
- Keep `.vscodeignore` strict and reviewed every release.
- Add a Marketplace publish dry-run checklist.
- Add a sanitized provider diagnostics export.

### P1 - modular architecture

- Extract provider discovery/capabilities from `sidebarProvider.ts`.
- Extract Agentic profile runtime and fallback orchestration from `sidebarProvider.ts`.
- Extract terminal/session/resource guards from `toolRegistry.ts`.
- Extract Remote Workspace and Web Bridge tools into dedicated modules.
- Add module-level unit tests before behavior changes.

### P1 - end-to-end confidence

- Add VS Code Extension Test Runner tests for sidebar activation, provider settings, model dropdown grouping, Agentic profile editing, follow-up queue, Studio, and web commands.
- Add mock provider servers for discovery, unsupported operations, tool calls, and 429/rate-limit flows.
- Add browser/manual `vscode.dev` smoke checklist until full browser automation is ready.

### P1 - Remote Tool Bridge

- Publish protocol spec.
- Publish reference bridge server.
- Require authentication.
- Add command/repo/path allowlists.
- Add audit logs and rate limits.
- Add Azure deployment templates.

### P2 - cost intelligence

- Add per-profile cost forecast.
- Add per-turn approximate spend tracking.
- Add premium model confirmation for large contexts.
- Add free-only benchmark workflow.
- Add weekly model-spend report export.

### P2 - enterprise governance

- Add team profile export/import with secret-free templates.
- Add policy file support for allowed providers, models, tools, and context budgets.
- Add workspace trust guidance.
- Add compliance-oriented logs that do not store secrets.

### P3 - UX polish

- Add screenshot-based docs.
- Add guided onboarding.
- Add provider health dashboard.
- Add search/filter inside the categorized model selector.
- Add profile recommendation wizard.

---

## 4. Operating principle

Do not claim enterprise-grade only because the extension is feature-rich. Enterprise-grade means:

- smaller reviewable modules
- repeatable setup
- predictable cost
- documented failure modes
- safe defaults
- auditable artifacts
- tested critical paths
- transparent model/tool routing
- fast rollback
- clear support and contribution channels

Sentinel should keep moving toward that bar every release.
