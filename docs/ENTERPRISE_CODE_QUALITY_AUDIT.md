# Enterprise code-quality and hardening audit

This document records the enterprise-grade quality posture for Sentinel Coder One Studio and the standard expected before public release.

## Executive summary

Sentinel Coder One Studio is a high-capability VS Code extension that touches sensitive areas: workspace files, terminal commands, Git operations, provider API keys, AI-generated code, webviews, media generation, and optional remote bridges. Enterprise quality therefore requires more than TypeScript compilation; it requires layered safety controls, packaging hygiene, secret scans, webview hardening, capability-aware provider routing, and end-to-end verification.

## Hard critique

### 1. Scope is powerful and risky

The extension exposes many autonomous capabilities. This is useful, but it increases blast radius if approval modes, command execution, or webview rendering are poorly controlled.

Required controls:

- Clear Ask/Plan/Agent modes.
- Explicit approval modes.
- Tool-call auditability.
- Destructive-command warnings.
- Security/firewall scans before publishing.
- Safe defaults for VS Code Web.

### 2. Provider behavior is not uniform

Azure, OpenRouter, Groq, Anthropic, Ollama, and OpenAI-compatible providers do not expose identical model metadata, supported parameters, context lengths, or native tool-call semantics.

Required controls:

- Live model discovery where available.
- Curated fallback only when discovery fails.
- Operation-aware native tool routing.
- Session-level learning when a provider rejects a parameter.
- Honest provider capability labels.

### 3. Long context can become expensive

Large-context models such as GPT-5.5-class deployments can accept huge input, but filling that window every turn is often wasteful.

Required controls:

- Conservative default context budgets.
- User-controlled budget settings.
- Summarization of older turns.
- Visible model usage telemetry.
- Agentic cost policy per profile.

### 4. Webview security is critical

VS Code webviews render inside an extension-controlled environment. Raw HTML assignment with workspace-controlled or model-controlled strings can create injection risk.

Required controls:

- DOM text APIs for user/workspace data.
- Escaped attributes.
- Centralized sanitized Markdown rendering when HTML fragments are required.
- Strict Content Security Policy.
- No `window.alert`, `confirm`, or `prompt` in webviews.

### 5. VS Code Web cannot be identical to Desktop

Browser extensions cannot directly access local terminals, Docker, SSH, local Ollama, or native MCP processes. Pretending otherwise creates bad UX and security problems.

Required controls:

- Browser-safe web entry point.
- Clear capability reporting.
- Optional authenticated Remote Tool Bridge for remote execution.
- Desktop recommendation for local unrestricted automation.

## Enterprise checklist

Before release:

1. TypeScript compile passes.
2. Regression tests pass.
3. Desktop VSIX package builds.
4. Web VSIX package builds.
5. Web manifest verification passes.
6. Packed VSIX artifacts exclude source, scripts, tests, scratch folders, and local inspection folders.
7. Secret scan passes on source, media, docs, package metadata, and packed artifacts.
8. Webview scan has no known raw dynamic HTML injection paths.
9. README and Marketplace descriptions document Desktop vs Web capability differences.
10. Provider settings docs explain secret storage.
11. Agentic profile docs explain cost/performance tradeoffs.
12. Donation QR encodes only the public PayPal donation URL.
13. Version is bumped before Marketplace publish.
14. GitHub commit is pushed after scans.
15. Marketplace publish uses a PAT passed through environment variable only, never printed.

## File-by-file review strategy

A literal proof of every runtime line is not possible for a VS Code extension with provider/network/UI variability, but enterprise review can be systematic:

- `src/extension.ts`: activation, command registration, desktop entry behavior.
- `src/extensionWeb.ts`: browser-safe entry behavior, UI-kind detection, web command support.
- `src/sidebarProvider.ts`: chat orchestration, provider routing, agentic profiles, model discovery, tool capability policy.
- `src/studioProvider.ts`: Studio webview rendering, file preview, generated asset browsing.
- `src/toolRegistry.ts`: tool definitions, filesystem/terminal/Git/Docker/SSH/RAG/firewall operations, approval safety.
- `media/sidebar.js`: chat webview runtime, model selector, profile editor, scroll behavior, DOM safety.
- `media/studio.js`: Studio client runtime, safe rendering and command messaging.
- `tests/*.cjs`: regression coverage for model selectors, agentic profiles, web manifest, provider capability routing.
- `package.json`: Marketplace metadata, web entry, scripts, activation, configuration.
- `.vscodeignore`: package hygiene.
- `docs/*`: public setup, operations, security, web compatibility, contribution, donation, and troubleshooting.

## Testing strategy

Recommended verification commands from the repository root:

```powershell
npm test
npx tsc -p ./
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-<version>.vsix
```

Recommended manual checks:

1. Install desktop VSIX locally with `code --install-extension <vsix> --force`.
2. Open Sentinel sidebar.
3. Configure at least one provider with a non-production test key.
4. Refresh model catalog.
5. Select a single model and run a small Ask-mode prompt.
6. Select an Agentic profile and confirm worker/reviewer telemetry appears for substantial Agent-mode tasks.
7. Create a file in a disposable workspace.
8. Run diagnostics/build in the disposable workspace.
9. Open Studio and confirm generated files render.
10. In VS Code Web, verify the extension loads and reports browser/bridge limitations honestly.

## Improvement backlog

Recommended enterprise improvements after this release:

1. Add Playwright-style webview interaction tests where VS Code test automation permits it.
2. Add contract tests for each provider adapter using recorded sanitized fixtures.
3. Add a structured policy file for enterprise tool allow/deny lists.
4. Add signed release attestations and checksums for VSIX artifacts.
5. Add telemetry opt-in documentation with privacy controls if telemetry is introduced.
6. Add accessibility snapshots for model selector/profile editor screens.
7. Add a bridge reference implementation for browser-safe remote terminals/SSH with allow-listing.
8. Add screenshot-based public tutorials for common workflows.
