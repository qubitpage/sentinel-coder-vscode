# Sentinel Coder One Studio - Enterprise Setup and Operations Guide

Sentinel Coder One Studio is a multi-provider AI coding, agent orchestration, and media/document Studio extension for Visual Studio Code. This guide explains how to deploy it safely for individual developers, teams, and enterprise workstations.

> Security rule: never commit API keys, personal access tokens, customer data, private endpoints, or generated workspace secrets. Configure secrets through VS Code secret storage, provider settings, environment variables, or git-ignored local files.

---

## 1. Runtime choices

### VS Code Desktop

Use Desktop for the full autonomous toolset:

- Workspace file creation, editing, deletion, and generated artifacts.
- Terminal commands, builds, tests, package scripts, Git commands, Docker, SSH, and local MCP tools.
- Local Ollama and private models.
- Media/document Studio with local files.
- Web browser preview for generated HTML.
- Security/firewall scans before publishing.

### VS Code Web / vscode.dev

Use Web mode for browser-safe workflows and remote-first projects. Browser extensions cannot directly run local terminals, Docker, SSH, local Ollama, native MCP processes, or unrestricted local filesystem commands. Sentinel therefore exposes web-safe UI, status, and configuration paths, and can be extended with a Remote Tool Bridge when you explicitly configure one.

Recommended enterprise pattern:

1. Use vscode.dev/github.dev for code reading, issue triage, docs, and safe model chat.
2. Use VS Code Desktop, a Codespace, a Dev Container, or a secured remote bridge for tool execution.
3. Keep all bridge endpoints authenticated, audited, and scoped to a project or sandbox.

---

## 2. Provider setup

Sentinel is bring-your-own-key and supports multiple provider families:

- Azure OpenAI / Azure AI Foundry.
- OpenAI-compatible APIs.
- OpenRouter.
- Groq.
- Anthropic.
- Mistral.
- DeepSeek.
- Together.
- Vultr.
- HuggingFace / Featherless.
- Moonshot / Kimi.
- Local Ollama.

### Safe key handling

Do:

- Use Sentinel provider settings or VS Code secret storage where available.
- Use environment variables for CI/devcontainer scenarios.
- Use git-ignored local secrets files only when needed.
- Rotate keys after accidental exposure.
- Use provider-side usage limits and budgets.

Do not:

- Commit keys into `settings.json`, source code, README examples, screenshots, docs, or VSIX artifacts.
- Paste real secrets into GitHub Issues.
- Share screenshots that expose full tokens, deployment URLs, private tenants, or customer code.

### Live model discovery

Sentinel refreshes configured model lists where providers expose catalog APIs. Live metadata may include:

- Model/deployment IDs.
- Context window.
- Output token limit.
- Supported parameters.
- Tool/native-call support.
- Pricing/free-tier labels when exposed.
- Modality/capability hints.

If a provider does not expose reliable metadata, Sentinel uses curated fallback labels and asks you to verify behavior with a small test prompt.

---

## 3. Model selection and Agentic Profiles

### Single-model mode

When you select a normal model, Sentinel should use that model directly at its detected capability. This is the recommended mode for:

- Testing a new provider.
- Predictable cost.
- Sensitive tasks where you do not want multi-model routing.
- Strong single-model work with GPT-5.5, GPT-4.1, Claude, Grok, Groq, OpenRouter, Ollama, or your private deployment.

### Agentic Profiles

Agentic Profiles are opt-in orchestration presets. They can define:

- Main/orchestrator model.
- Worker model pool.
- Reviewer model pool.
- Cost policy.
- Maximum parallelism.
- Premium-worker permission.
- Cheap/free fallback permission.
- Profile-specific operating instructions.

Built-in strategies include:

- Free-only multi-provider profiles for testing orchestration without paid spend.
- Azure cost-smart production routing.
- OpenAI balanced coding.
- Anthropic code-quality review.
- OpenRouter balanced and free-tier swarms.
- Groq fast OSS fan-out.
- Local/private Ollama.
- Multi-provider frontier council.

Enterprise recommendation:

1. Keep single-model as the default for day-to-day focused work.
2. Use Agentic Profiles for large, ambiguous, high-risk, or review-heavy tasks.
3. Route low-risk reading/drafting to cheap/free/local workers.
4. Reserve expensive frontier models for final decisions, security, architecture, and unresolved disagreements.
5. Always verify by running real tests/builds/scans.

---

## 4. Context and cost controls

Large-context models are powerful but expensive. Sentinel detects model windows, but the team should configure a context budget rather than sending maximum context by default.

Recommended budgets:

| Workload | Suggested context budget |
| --- | ---: |
| Quick chat | 16K-32K |
| Normal coding | 32K-64K |
| Multi-file change | 64K-96K |
| Release review | 96K-192K |
| Deep security/architecture audit | 192K-256K |
| Exceptional full-context review | 256K+ only with explicit approval |

Best practices:

- Prefer exact file reads and codebase search over dumping the whole workspace.
- Summarize old turns instead of replaying everything.
- Show which orchestrator and sub-agent models were used.
- Review provider invoices weekly during rollout.

---

## 5. Approval modes

- `default`: ask before tool actions; safest for new users.
- `bypass`: auto-approve safe/moderate actions; still ask for dangerous tools.
- `autopilot`: auto-approve everything and auto-continue; use only for trusted, sandboxed tasks.

Enterprise default: `default` for production repositories; `bypass` for trusted test projects; `autopilot` only in disposable branches/containers with CI validation.

---

## 6. Studio media/document workflows

Studio supports generated and inspected assets such as:

- Images.
- Video.
- Speech/audio.
- Office documents.
- Presentations.
- Reports.
- Data exports.

Use cases:

- Generate product screenshots/mockups.
- Create release notes visuals.
- Produce internal training material.
- Draft pitch decks and whitepapers.
- Inspect PDFs, DOCX files, images, and generated artifacts.

Media generation depends on configured provider capabilities. Do not promise video generation unless a tested provider/deployment such as Azure Sora is configured and available in your environment.

---

## 7. Security hardening checklist

Before publishing code, docs, GitHub commits, or VSIX packages:

1. Run TypeScript compile.
2. Run regression tests.
3. Run web manifest verification for the web VSIX.
4. Inspect packaged VSIX files for forbidden paths.
5. Run secret scans on `src`, `media`, docs, package metadata, and package output.
6. Confirm `.vscodeignore` excludes tests, scripts, scratch files, source maps if undesired, temporary workspaces, old inspect folders, and local settings.
7. Confirm README screenshots do not show secrets.
8. Confirm donation QR/image does not encode a secret or tracking token beyond the public PayPal donation URL.
9. Confirm marketplace version is new and changelog is updated.
10. Publish with the PAT passed through an environment variable, never printed.

---

## 8. Troubleshooting

### Extension unavailable on vscode.dev

Check that the Marketplace package includes:

- `browser` entry in `package.json`.
- `extensionKind` compatible with web.
- `out/extensionWeb.js`.
- Browser-safe activation code.
- Web VSIX package published to Marketplace.

### Model missing from dropdown

- Refresh provider catalog.
- Verify API key/base URL/deployment name.
- Confirm the model is chat-capable.
- Check whether the provider exposes `/models` or deployment metadata.
- Use a curated fallback only until live discovery works.

### Azure/OpenAI tool-call unsupported error

Sentinel uses operation-aware routing, but provider metadata can be incomplete. If a model rejects native tools, Sentinel should retry without unsupported native tool parameters and remember the session-level capability result.

### Agentic profile not using workers

- Confirm you selected an `Agentic:` profile, not a normal single model.
- Confirm Agent mode is active.
- Confirm the task is substantial enough for preflight.
- Confirm worker/reviewer models are configured and available.
- Check turn footer model-usage telemetry.

---

## 9. Contributing and donations

Sentinel Coder One Studio is open source. Contributions are welcome:

- GitHub: https://github.com/qubitpage/sentinel-coder-vscode
- Issues: https://github.com/qubitpage/sentinel-coder-vscode/issues
- Contribution guide: https://github.com/qubitpage/sentinel-coder-vscode/blob/main/CONTRIBUTING.md

If Sentinel helps your work and you want to support frequent updates, any amount is useful to sustain development. Donations help keep the project open source, maintained, and improving.

- Donate with PayPal: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS
