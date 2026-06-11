# Sentinel Coder One Studio Whitepaper

## Enterprise AI Coding, Multi-Provider Orchestration, and Media-Aware Development inside VS Code

Version target: 3.16.12+

---

## Abstract

Sentinel Coder One Studio is an open-source Visual Studio Code extension for AI-assisted software development. It combines direct single-model chat, opt-in multi-model Agentic Profiles, live provider model discovery, dynamic context budgeting, operation-aware native tool routing, VS Code Web compatibility, and a media/document Studio.

The design goal is practical enterprise productivity: let strong models work directly when selected, use orchestration only when the user asks for it, avoid unnecessary token spend, preserve security boundaries, and verify work through real tools before claiming success.

---

## 1. Problem statement

Modern AI coding workflows face several enterprise blockers:

- Model catalogs change quickly and hardcoded lists become stale.
- Context windows differ across providers and deployments.
- Native tool-calling support varies by model, provider, and operation.
- Browser-based VS Code cannot run local native tools directly.
- Agent swarms can waste money if orchestration is automatic and invisible.
- Webviews can become XSS surfaces if dynamic HTML is not treated carefully.
- Marketplace packages can accidentally include scratch files, tests, or secrets.
- Users need documentation that explains setup, costs, safety, media tooling, and contribution paths.

Sentinel addresses these through live discovery, opt-in orchestration, capability-aware routing, context budgets, web/desktop separation, security scans, and public documentation.

---

## 2. Architecture overview

Sentinel has four major layers:

1. **VS Code extension host** - commands, views, settings, provider integrations, tools, and workspace operations.
2. **Webview UI** - chat, settings, model selector, Agentic Profiles, Studio, status, and telemetry surfaces.
3. **Provider layer** - Azure/OpenAI-compatible, OpenRouter, Groq, Anthropic-style, Ollama/local, and custom provider routing.
4. **Agent/tool layer** - file operations, search, diagnostics, terminal, Git, Docker, SSH, HTTP, RAG, media/document generation, firewall scans, and browser previews.

Desktop mode exposes the full tool layer. Web mode activates browser-safe entry points and explains/bridges operations that require a server or desktop runtime.

---

## 3. Single-model mode

Sentinel intentionally preserves single-model behavior. If the user selects a normal model, the extension should use that model directly at its detected capability. No sub-agents are spawned implicitly.

This is important for:

- Predictable cost.
- Reproducibility.
- Provider testing.
- Trust.
- Letting premium models such as GPT-5.5, GPT-4.1, Claude, Grok, or local coding models work to their maximum potential when explicitly selected.

---

## 4. Agentic Profiles

Agentic Profiles are opt-in orchestration templates. A profile can select an orchestrator, worker pool, reviewer pool, parallelism limit, cost policy, and instructions.

Recommended roles:

- **Orchestrator** - owns plan, tool execution, final synthesis, and verification.
- **Workers** - gather evidence, draft code, write tests, summarize docs, or brainstorm alternatives.
- **Reviewers** - adversarial critique, security review, architecture review, and quality gates.

Worker output is never authoritative. The orchestrator must inspect, correct, apply, and verify.

---

## 5. Live provider discovery

Sentinel prefers live provider APIs over static assumptions:

- Azure deployments should come from live deployment/model APIs where possible.
- OpenAI-compatible catalogs can use `/models`.
- OpenRouter can expose pricing, supported parameters, context windows, and free-tier labels.
- Groq and other providers can expose fast OSS catalogs.
- Ollama can expose locally pulled models.

Curated fallback metadata remains useful for offline or incomplete providers, but successful live discovery should be authoritative.

---

## 6. Dynamic context budgeting

Large context windows are powerful but expensive. Sentinel distinguishes between:

- Model maximum context.
- User-approved context budget.
- Dynamic context assembled from active file, open tabs, diagnostics, Git status, provider metadata, and explicit reads.

The extension should not automatically fill very large windows every turn. Instead, it should summarize older turns and use targeted context retrieval.

---

## 7. Operation-aware tool routing

Provider-native tool support is not universal. A model may support chat but not `tools`, `tool_choice`, JSON schemas, or a specific operation.

Sentinel should:

- Detect supported parameters where metadata exists.
- Avoid unsupported native tool arguments.
- Learn from provider errors during the session.
- Retry unsupported native-tool attempts as normal streaming chat where safe.
- Keep host-side tools available through the extension agent loop when provider-native tools are unsupported.

---

## 8. VS Code Web compatibility

VS Code Web requires browser-safe extension code:

- A `browser` entry point.
- No Node-only desktop imports in the web entry.
- Web-safe command registration.
- Clear guidance for Desktop-only actions.
- Optional Remote Tool Bridge for server-side execution.

Web mode should be honest about browser sandbox limits while still enabling as much functionality as possible through remote/bridge patterns.

---

## 9. Media and Document Studio

The Studio expands coding workflows into documentation and communication workflows:

- Images for product docs and presentations.
- Video generation prompts/outputs where configured.
- Speech/audio generation.
- Office/document creation and inspection.
- Generated reports, whitepapers, pitch decks, and release artifacts.

Enterprise usage should keep provider keys secure and generated artifacts reviewed before publication.

---

## 10. Security model

Primary security goals:

- Never hardcode secrets.
- Keep webviews resistant to unsafe HTML injection.
- Keep Marketplace packages free of tests, scratch files, local workspaces, and secrets.
- Require approval for risky operations unless the user chooses a more permissive mode.
- Treat all provider/model/tool outputs as untrusted until verified.
- Preserve transparent logs and usage telemetry without exposing private data.

---

## 11. Testing and release process

A release should require:

- TypeScript compile.
- Regression tests.
- Web manifest verification.
- Desktop and web VSIX packaging.
- VSIX content inspection.
- Firewall/secret scans.
- Marketplace-visible README and changelog updates.
- GitHub contribution/security docs.

---

## 12. Hard self-critique

Current risks and improvement opportunities:

1. **Test coverage depth** - static/regression tests are useful, but more end-to-end VS Code integration tests are needed.
2. **Provider variability** - live catalogs differ and can break assumptions; capability detection must remain conservative.
3. **Web tool bridge maturity** - browser mode needs a hardened, authenticated remote bridge story before claiming parity with Desktop.
4. **Cost optimization** - Agentic orchestration can still waste tokens if profiles are too broad; defaults should remain conservative.
5. **UX complexity** - many providers/settings can overwhelm users; guided setup and presets should be improved.
6. **Security review** - webview and packaging scans should become automated CI gates.
7. **Documentation freshness** - provider names, context windows, and supported parameters change quickly; docs should explain dynamic behavior rather than promise exact static values.

---

## 13. Roadmap

- CI-based VSIX pack/inspect/scan pipeline.
- More automated VS Code integration tests.
- Provider capability matrix generated from live discovery.
- Hardened Remote Tool Bridge reference implementation.
- Better onboarding wizard with provider health checks.
- More Studio templates for docs, pitch decks, changelogs, and release reports.
- Community Agentic Profile library.
- Enterprise policy controls for allowed providers, budgets, tools, and approval modes.

---

## 14. Open-source sustainability

The project is open source. Community issues, pull requests, docs fixes, testing feedback, provider templates, and donations help keep the extension updated.

Donation link: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS
