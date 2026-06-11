# Sentinel Coder One Studio - Enterprise Setup and Operations Guide

This guide explains how to deploy, configure, operate, and troubleshoot Sentinel Coder One Studio in individual, team, and enterprise VS Code environments.

Sentinel Coder One Studio is an open-source VS Code AI coding extension with direct single-model mode, opt-in Agentic Profiles, live provider model discovery, dynamic context budgeting, operation-aware tool routing, VS Code Web compatibility, and a media/document Studio.

> Security rule: never commit API keys, tokens, private endpoints, customer data, or generated local configuration files to GitHub or Marketplace packages.

---

## 1. Recommended installation paths

### VS Code Desktop

Use Desktop for full autonomous engineering workflows:

- Read/create/edit/delete files.
- Run terminal commands, builds, tests, package scripts, and local servers.
- Use Git, Docker, SSH, and local Ollama.
- Use native MCP servers and local tools.
- Generate and inspect local documents/media.
- Use the full Media & Document Studio.

### VS Code Web / vscode.dev / github.dev

Use Web for browser-safe workflows:

- Provider setup guidance.
- Web-safe chat and Studio surfaces.
- Remote workspace awareness where VS Code exposes it.
- Remote Tool Bridge configuration for Desktop/server-side execution.

Browser extensions cannot directly run local terminals, Docker, SSH subprocesses, local Ollama, or native MCP processes. Sentinel does not pretend these operations are browser-native; instead it documents and exposes bridge-based patterns for remote execution when configured.

---

## 2. First-run checklist

1. Install Sentinel Coder One Studio from Marketplace or a verified VSIX.
2. Open the Sentinel activity bar icon.
3. Open Settings in the Sentinel sidebar.
4. Add one or more providers.
5. Store API keys only through the extension settings/secret storage or a git-ignored secrets file.
6. Refresh provider catalogs so the model dropdown is populated from live provider APIs where possible.
7. Select a normal model for direct single-model mode, or select an `Agentic:` profile for opt-in orchestration.
8. Start with a safe read-only request: `Inspect this workspace and explain the project structure.`
9. Move to Agent mode only after you understand the workspace and approval mode.

---

## 3. Provider setup overview

Supported provider families include:

- Azure OpenAI / Azure AI Foundry.
- OpenAI and OpenAI-compatible APIs.
- Anthropic / Claude-compatible endpoints where configured.
- OpenRouter.
- Groq.
- Mistral.
- DeepSeek.
- Together.
- Vultr.
- HuggingFace / Featherless.
- Moonshot / Kimi.
- Local Ollama.

Sentinel tries to discover live models/deployments and metadata from provider APIs. If a provider does not expose context/output/pricing metadata, Sentinel uses curated fallback labels only as a fallback.

---

## 4. Model selector strategy

The chat model selector is designed for clarity:

1. **Agentic Modes** - explicit orchestration profiles.
2. **Most used models and modes** - common daily choices.
3. **All models by provider** - grouped by provider and cost category.
4. **Free/free-tier/local before paid** where metadata allows.

Normal model selection is direct single-model mode. Sentinel should not spawn sub-agents unless the selected item is an `Agentic:` profile.

---

## 5. Agentic Profiles

Agentic Profiles are editable orchestration templates. A profile can define:

- Main/orchestrator model.
- Worker model pool.
- Reviewer model pool.
- Default worker model.
- Cost policy.
- Max parallel agents.
- Premium-worker permissions.
- Cheap/free fallback policy.
- Profile-specific instructions.

Recommended enterprise pattern:

- Use a reliable mid/frontier model for orchestration.
- Use cheap/free/local models for extraction, drafts, tests, docs, and brainstorming.
- Use a different provider/model for adversarial review.
- Reserve expensive frontier deployments for final decisions, security, architecture, finance, and high-risk release gates.

---

## 6. Dynamic context and cost controls

Important settings:

- `sentinelCoder.maxTokens` - output cap; `0` means auto within model limits.
- `sentinelCoder.contextBudgetTokens` - maximum input context budget for long sessions.
- Dynamic context toggles - active file, open tabs, diagnostics, Git status, provider metadata.

Cost-safe defaults intentionally avoid filling 1M-token windows automatically. Increase budgets only when the task truly benefits from deep context.

---

## 7. Approval modes

- **default** - ask before tools and require manual Continue after safety ceilings.
- **bypass** - auto-approve safe/moderate actions; still ask for risky actions.
- **autopilot** - auto-approve and auto-continue. Use only in trusted workspaces.

Enterprise recommendation: use `default` for production repositories, `bypass` for controlled maintenance tasks, and `autopilot` only in disposable branches/sandboxes.

---

## 8. Studio and media workflows

The Studio can support:

- Generated image previews.
- Speech/audio generation outputs.
- Video generation outputs where provider support is configured.
- Document inspection and generated Office/document artifacts.
- Presentation and report workflows.

For Azure media models, configure the relevant Azure deployments and never place keys in source files.

Example safe prompts:

- `Generate a product hero image for documentation, no logos, no readable text.`
- `Create a short product explainer video prompt and save metadata.`
- `Create an enterprise release checklist document.`

---

## 9. VS Code Web and remote tooling

VS Code Web support requires a browser-compatible extension entry point and a web-target VSIX publish path. Desktop-only capabilities must be bridged or clearly explained.

Web mode should:

- Activate without Node-only desktop imports.
- Register contributed commands with clear Desktop/Bridge guidance.
- Avoid promising local terminal/Docker/SSH execution in the browser.
- Support a Remote Tool Bridge pattern for secure server-side execution when configured.

---

## 10. Enterprise release process

Before publishing:

1. Review changed files.
2. Run TypeScript compile.
3. Run regression tests.
4. Run web manifest verification.
5. Package desktop and web VSIXs.
6. Inspect VSIX contents.
7. Run firewall/security scans on source, media, docs, and package contents.
8. Search for API-key/token patterns.
9. Confirm no scratch scripts, local workspaces, or private config are included.
10. Publish only after green checks.

---

## 11. Troubleshooting

### Marketplace says the extension is not available for Web

Verify the published VSIX includes:

- `browser` entry in `package.json`.
- `extensionKind` appropriate for web UI.
- `out/extensionWeb.js`.
- Browser-safe activation code.

### Provider models missing

- Check provider key/base URL.
- Refresh provider catalog.
- Confirm the provider exposes a model/deployment API.
- Check whether the model is chat-capable; embeddings/media/moderation models may be filtered from chat selectors.

### Azure GPT-5.x returns unsupported operation

Sentinel uses operation-aware routing and should avoid unsupported native-tool parameters. If a provider rejects tool calling, Sentinel should disable that native-tool mode for the deployment and retry as normal streaming chat.

### Agentic did not run

Agentic orchestration is opt-in. Select an `Agentic:` profile, use Agent mode, and ask a substantial task. Normal model selections intentionally remain single-model.

---

## 12. Support the project

Sentinel Coder One Studio is open source. If it helps your work and you want it to stay frequently updated, any donation helps sustain development, provider testing, documentation, security hardening, and Marketplace maintenance.

Donate: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS

See also: [Donation and Community Support](DONATION_AND_COMMUNITY.md).
