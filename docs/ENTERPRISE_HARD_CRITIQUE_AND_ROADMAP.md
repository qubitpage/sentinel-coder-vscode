# Enterprise Hard Critique and Improvement Roadmap

This document is intentionally critical. Sentinel Coder One Studio is powerful, but enterprise reliability requires continuous hardening.

---

## 1. Hard critiques

### 1.1 Testing is still not enough

Current regression tests cover important routing/profile/manifest behavior, but they are not equivalent to full UI automation or line-by-line execution. Enterprise-grade confidence needs VS Code Extension Test Runner coverage for sidebar flows, settings forms, Studio interactions, and web-mode commands.

### 1.2 Web mode needs a reference bridge

The Remote Tool Bridge strategy is correct, but users need a hardened reference implementation with authentication, command allowlists, audit logs, rate limits, and deployment templates. Without that, web users may misconfigure unsafe bridges.

### 1.3 Provider behavior changes constantly

Provider APIs and supported parameters evolve. Static fallback catalogs are useful, but live capability probes, cache invalidation, telemetry, and user-visible provider health are essential.

### 1.4 Cost controls need more UX

Context budgets and model-usage footers are good, but users still need per-turn cost estimates, budget alerts, and profile-level spend simulation before running large Agentic jobs.

### 1.5 Security scanning should become CI-gated

Manual scans are useful but not enough. The repo should enforce secret scans, webview-sink scans, package inspection, and compile/tests in CI before merge/release.

### 1.6 Accessibility needs formal audits

Chat, model selector grouping, settings, and Studio should be tested with keyboard-only flows, screen readers, high contrast mode, and reduced motion.

### 1.7 Documentation must stay versioned

The extension moves quickly. Docs can become stale unless release notes, README, and guides are updated together and checked in CI.

---

## 2. Priority backlog

### P0 — release safety

- Add CI workflow for compile, tests, web manifest verification, package inspection, and secret scan.
- Add a script that fails on forbidden files inside VSIX artifacts.
- Keep `.vscodeignore` strict and reviewed every release.
- Add a Marketplace publish dry-run checklist.

### P1 — end-to-end confidence

- Add VS Code Extension Test Runner tests for:
  - sidebar activation
  - provider settings render
  - model dropdown grouping
  - Agentic profile editor add/remove agents
  - Add follow-up while running
  - Studio open/refresh
  - web-mode command behavior
- Add mock provider servers for capability discovery and unsupported-tool fallbacks.

### P1 — Remote Tool Bridge

- Publish a reference bridge server.
- Require authentication.
- Add command allowlists.
- Add repo/path allowlists.
- Add audit logs.
- Add deployment templates for Azure.

### P2 — cost intelligence

- Add per-profile cost forecast.
- Add per-turn approximate spend tracking.
- Add “premium model confirmation” for large context runs.
- Add free-only benchmark workflow.

### P2 — enterprise governance

- Add team profile export/import with secret-free templates.
- Add policy file support for allowed providers/models/tools.
- Add workspace trust guidance.
- Add compliance-oriented logs that do not store secrets.

### P3 — UX polish

- Add screenshot-based docs.
- Add guided onboarding.
- Add status health dashboard for providers.
- Add search/filter inside the model selector.
- Add profile recommendation wizard.

---

## 3. Operating principle

Do not claim enterprise-grade because the extension is feature-rich. Enterprise-grade means:

- repeatable setup
- predictable cost
- documented failure modes
- safe defaults
- audited artifacts
- tested critical paths
- transparent model/tool routing
- fast rollback and clear support channels

Sentinel should keep moving toward that bar every release.
