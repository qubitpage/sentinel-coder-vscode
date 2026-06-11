# Sentinel Coder One Studio - Enterprise User Guide

Sentinel Coder One Studio is an open-source VS Code extension for autonomous coding, multi-provider AI chat, opt-in Agentic Profiles, media/document generation, and secure project automation.

This guide is written for developers, teams, and enterprise administrators who need repeatable setup, predictable cost, safe provider configuration, and a clear path from local development to VS Code Web.

---

## 1. Install

### VS Code Desktop

1. Open Visual Studio Code.
2. Go to **Extensions**.
3. Search for **Sentinel Coder One Studio**.
4. Install the extension by publisher **Qubitpage**.
5. Open the Sentinel activity-bar icon.

### VS Code Web / vscode.dev

Sentinel includes a browser entry point for vscode.dev/github.dev. Browser mode cannot run your local terminal, Docker daemon, local Ollama, or native SSH process directly inside the browser sandbox. Instead, web mode exposes browser-safe UI and can use a configured Remote Tool Bridge for server-side tool execution.

Use **Sentinel Coder: Web Compatibility Status** to verify what is available in the current host.

---

## 2. First-run setup

1. Open the Sentinel sidebar.
2. Open **Settings**.
3. Add one or more providers.
4. Paste API keys only into Sentinel settings/secrets UI or a local git-ignored key file if you intentionally use bulk import.
5. Click provider refresh/test so Sentinel can discover live models and context windows.
6. Choose a normal model for direct single-model work, or choose an `Agentic:` profile when you want orchestration.

Never commit API keys, provider tokens, `.env` files, local VS Code storage, or personal key import files.

---

## 3. Model selector strategy

The chat model selector is organized for real operations:

1. **Agentic Modes** - explicit orchestration profiles. These run worker/reviewer logic only when selected.
2. **Most used models and modes** - fast access to common daily choices.
3. **All models by provider** - grouped by provider and pricing category: Local, Free, Free-tier, Subscription, Paid, or Unknown.

### Single-model mode

If you choose a normal model such as Azure GPT-5.5, GPT-4.1, Claude, Groq, OpenRouter, or Ollama, Sentinel uses that model directly and allows it to operate at its detected context/output capability subject to your configured context budget.

### Agentic mode

If you choose an `Agentic:` profile, Sentinel runs deterministic worker/reviewer preflight for substantial tasks. This is useful for audits, enterprise refactors, security reviews, docs, and high-risk changes.

---

## 4. Recommended enterprise profiles

Use these as starting points and edit them with live dropdowns:

- **Standard: Single Model** - no orchestration; best for normal coding.
- **Cost-Saving Boss Orchestrator** - premium model manages low-cost/free workers.
- **Azure Cost-Smart Production** - strong Azure orchestrator, targeted premium review only when justified.
- **Free Multi-Provider Agentic Lab** - free/free-tier workers for experimentation and benchmarking.
- **Security Review Ensemble** - different provider families for adversarial review.
- **Local/Private Coding** - Ollama or private deployments for sensitive code.

Hard rule: do not use premium workers for every tiny task. Use premium models for architecture, hard debugging, security, financial decisions, and final review.

---

## 5. Daily workflows

### A. Safe code edit

1. Ask Sentinel to inspect relevant files first.
2. Ask for a plan.
3. Switch to Agent mode.
4. Let Sentinel edit with minimal diffs.
5. Require compile/tests before accepting.
6. Review the diff.

### B. Enterprise refactor

1. Select an Agentic profile with reviewer models.
2. Ask Sentinel to create a plan and risk list.
3. Run changes in small batches.
4. Compile after each batch.
5. Run targeted tests and package checks.
6. Use firewall scan before commit.

### C. Provider benchmarking

1. Configure several providers.
2. Refresh live catalogs.
3. Use free-only profiles for cheap discovery.
4. Compare output quality, latency, and failure behavior.
5. Promote the best models to daily profiles.

### D. Media/document Studio

1. Open **Sentinel Coder: Open Media & Document Studio**.
2. Generate or inspect images, audio, video, office documents, reports, and transcripts depending on configured providers.
3. Save generated artifacts under project-safe folders.
4. Scan outputs before publishing if they are bundled.

---

## 6. VS Code Web and Remote Tool Bridge

Browser-hosted VS Code cannot access local machine primitives directly. Sentinel's web strategy is:

- Show browser-safe chat, Studio, settings, and help.
- Keep web entry code free of Node-only imports.
- Route privileged operations through an explicitly configured Remote Tool Bridge.
- Make unavailable operations visible rather than silently failing.

Recommended enterprise deployment:

1. Host a controlled bridge service inside your cloud or internal network.
2. Authenticate it with short-lived tokens or SSO gateway.
3. Limit allowed commands, repositories, and hosts.
4. Log requests and results.
5. Never expose unrestricted shell execution to the public internet.

---

## 7. Security expectations

Before pushing or publishing:

- Run TypeScript compile.
- Run regression tests.
- Package desktop and web VSIXs.
- Inspect packed files.
- Run secret scans on source and artifacts.
- Verify no local key files, scratch files, old inspection folders, or configured VS Code storage are included.

Sentinel is powerful. Treat tool execution like a junior engineer with shell access: require review, limit credentials, and inspect diffs.

---

## 8. Support, contribution, and donations

Sentinel Coder One Studio is open source. Contributions and issues are welcome:

- Repository: https://github.com/qubitpage/sentinel-coder-vscode
- Issues: https://github.com/qubitpage/sentinel-coder-vscode/issues
- Contributing: ../CONTRIBUTING.md

If Sentinel helps your work and you want to keep the project frequently updated, any donation helps sustain development:

- Donate via PayPal: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS

The project is open source; donations help keep it maintained, tested, documented, and available to the community.
