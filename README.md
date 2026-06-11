<div align="center">

# Sentinel Coder One Studio

### Autonomous AI coding + Agentic Profiles + Media & Document Studio for Visual Studio Code

**Multi-provider chat · Real tool use · Single-model full-capability mode · Opt-in Agentic orchestration · Azure/OpenAI/Groq/OpenRouter/Ollama · Sora video · Image/audio/document Studio · VS Code Web compatibility mode**

Built by [QubitPage Research](https://github.com/qubitpage) · MIT licensed

[GitHub repository](https://github.com/qubitpage/sentinel-coder-vscode) · [Contributing guide](https://github.com/qubitpage/sentinel-coder-vscode/blob/main/CONTRIBUTING.md) · [Issues and feature requests](https://github.com/qubitpage/sentinel-coder-vscode/issues)

</div>

---

## What is Sentinel Coder One Studio?

Sentinel Coder One Studio is a VS Code AI agent that can help you plan, code, edit, test, package, document, inspect files, generate media, and orchestrate multiple AI models when you explicitly choose an Agentic Profile.

It is designed around two safe defaults:

1. **Single-model mode uses the selected model directly.** If you choose GPT-4.1, GPT-5.5, Grok, OpenRouter, Groq, Ollama, or any other configured model from the normal dropdown, Sentinel lets that model work to its full detected capability.
2. **Agentic orchestration is opt-in.** Worker/reviewer routing activates only when you intentionally choose a real `Agentic:` profile.

---

## New in 3.16.10

- **Deterministic Agentic orchestration**: when you explicitly select an `Agentic:` profile and the task is substantial, Sentinel now proactively runs the profile worker/reviewer preflight and injects those findings into the main orchestrator turn.
- **Single models still work at maximum potential**: choosing a normal model keeps a direct single-model flow with the model's detected context/output capability; orchestration only activates for selected Agentic profiles.
- **Live dropdown Agentic profile editor**: Settings -> Agentic now uses provider/model dropdowns for the main orchestrator and multi-select live model lists for adding worker and reviewer agents under each profile.
- **Selection preservation during provider refresh**: if Azure/Groq/OpenRouter/OpenAI-compatible provider discovery updates while the profile editor is open, selected agents are preserved instead of disappearing.
- **Visible agent pools**: profile cards show main model, worker agents, default worker, reviewer agents, policy, premium-worker setting, and max parallel count.
- **Add follow-up while running**: the Send button becomes a highlighted **Add follow-up** action during active runs so you can queue extra instructions without stopping the agent.
- **Live provider catalogs and context metadata**: Azure/OpenAI-compatible providers can refresh model lists and context windows from provider APIs, with curated fallback only when live data is unavailable.
- **VS Code Web / vscode.dev compatibility workflow**: browser entry point, web workspace capability declarations, web VSIX packaging, and a packed-manifest verifier are included.
- **Expanded public documentation**: see [End-to-End User Guide](docs/END_TO_END_USER_GUIDE.md).

---

## Core features

### Coding agent

- Ask, Plan, and Agent modes.
- Create, read, edit, append, and delete files.
- Search files/text and use natural-language codebase search.
- Read active file, selection, diagnostics, open tabs, and workspace info.
- Run terminal commands with persistent shell state.
- Build/test/package real projects and report actual command results.
- Serve local HTML files and open browser previews.
- Git status/diff/log/commit/push helpers.
- Docker and SSH tools in VS Code Desktop.
- HTTP requests and web search.
- RAG ingest/query for project knowledge.
- Targeted firewall/security scan for secrets, unsafe HTML, injection risks, destructive commands, and debug code.

### Multi-provider model support

Configured providers can include:

- Azure OpenAI / Azure AI Foundry.
- OpenAI-compatible providers.
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

Where available, Sentinel refreshes model dropdowns from live provider APIs and updates context/output metadata automatically.

### Community and contributions

Sentinel Coder One Studio is published with a public contribution path:

- Repository: [github.com/qubitpage/sentinel-coder-vscode](https://github.com/qubitpage/sentinel-coder-vscode)
- Contribution guide: [CONTRIBUTING.md](https://github.com/qubitpage/sentinel-coder-vscode/blob/main/CONTRIBUTING.md)
- Issues and feature requests: [GitHub Issues](https://github.com/qubitpage/sentinel-coder-vscode/issues)

Use the repository for provider requests, Web compatibility reports, Agentic Profile templates, Studio/media workflow improvements, docs fixes, and security-hardening suggestions. Do not post API keys or private customer data in public issues.

### Agentic Profiles

Agentic Profiles let you define opt-in orchestration from live model selectors:

- Main/orchestrator model from the configured provider/model dropdown.
- Worker agent models via multi-select dropdowns populated from Azure, Groq, OpenRouter, OpenAI-compatible providers, Ollama, and other configured catalogs.
- Reviewer agent models via multi-select dropdowns.
- Default worker model chosen from selected workers plus the full live model registry.
- Cost policy.
- Maximum parallel agents.
- Premium-worker and cheap/free fallback policy.
- Profile-specific instructions.

When a real `Agentic:` profile is selected in Agent mode, Sentinel runs deterministic worker/reviewer preflight for substantial tasks and shows the orchestrator plus sub-agent models in the turn footer. Normal model selections remain single-model and do not auto-orchestrate.

Recommended cost-smart pattern:

- Use a strong daily model such as GPT-4.1 as orchestrator.
- Use Grok or another adversarial model for critique/review.
- Use cheaper/free workers for low-risk drafts and extraction.
- Reserve GPT-5.5/frontier models for final review, architecture, security, finance, and hard unresolved decisions.

### Media & Document Studio

The Studio view lets you browse, preview, inspect, edit, and reuse generated or workspace assets.

Supported workflows include:

- Generated image previews.
- Azure Sora 2 video generation and MP4 playback.
- Azure Speech audio generation.
- Speechmatics transcription.
- PDF/Office/image/audio/video inspection where local tooling is available.
- DOCX/XLSX/PPTX generation.
- Organized generated folders under `.sentinel/generated/`.
- Version snapshots for edited text/data files.
- Sending files or selected content back to chat for rewrite, OCR, summarization, transcription, regeneration, or transformation.

Generated outputs are organized as:

```text
.sentinel/generated/
  images/
  videos/
  audio/
  documents/
  presentations/
  data/
  reports/
  templates/
```

---

## Quick start

1. Install **Sentinel Coder One Studio**.
2. Open the Sentinel activity-bar icon.
3. Open Settings inside the Sentinel sidebar.
4. Add your provider API keys and endpoints.
5. Pick a model from the dropdown.
6. Choose a chat mode:
   - **Ask** for explanations.
   - **Plan** for step-by-step planning before edits.
   - **Agent** for autonomous tool use.
7. Try:

```text
Inspect this workspace, identify the project type, and tell me the correct build/test commands.
```

For autonomous changes:

```text
Fix the TypeScript errors, run the build, and summarize the exact files changed. Do not call it done if the build fails.
```

---

## Settings guide

Important settings exposed by the extension:

| Setting | Purpose |
| --- | --- |
| `sentinelCoder.ollamaUrl` | Local Ollama base URL. |
| `sentinelCoder.model` | Default local/Ollama model name. |
| `sentinelCoder.maxTokens` | Max response tokens. `0` = auto, use selected model's detected output limit. |
| `sentinelCoder.contextBudgetTokens` | Input-context budget ceiling for long sessions; default is cost-safe. |
| `sentinelCoder.temperature` | Generation randomness. |
| `sentinelCoder.defaultMode` | Default mode: `agent`, `ask`, or `plan`. |
| `sentinelCoder.approvalMode` | Tool approval behavior: `default`, `bypass`, or `autopilot`. |
| `sentinelCoder.providers` | Configured API providers, managed by Sentinel settings UI. |
| `sentinelCoder.apiKeysFile` | Optional file for bulk API-key import. Prefer git-ignored secret files. |
| `sentinelCoder.mcpServers` | MCP server configurations for Desktop mode. |
| `sentinelCoder.dynamicContextEnabled` | Include automatic workspace/editor context. |
| `sentinelCoder.dynamicContextMaxChars` | Character budget for dynamic context. |
| `sentinelCoder.dynamicContext.includeActiveFile` | Include active editor content/name. |
| `sentinelCoder.dynamicContext.includeOpenTabs` | Include open tab names. |
| `sentinelCoder.dynamicContext.includeDiagnostics` | Include VS Code diagnostics summary. |
| `sentinelCoder.dynamicContext.includeGitStatus` | Include git status/recent change context. |
| `sentinelCoder.dynamicContext.includeProviderMetadata` | Include selected provider/model metadata. |

Recommended context budgets:

| Scenario | Suggested budget |
| --- | ---: |
| Quick chat / small edit | 16K-32K |
| Normal coding | 32K-64K |
| Multi-file refactor | 64K-96K |
| Architecture review | 96K-192K |
| Deep audit | 192K-256K |
| Exceptional full-context review | 256K+ only with explicit intent |

---

## How to use Studio and media generation

Open Studio from the Sentinel activity-bar view or Command Palette:

```text
Sentinel Coder: Open Media & Document Studio
```

Example image request:

```text
Generate a premium web hero image for a developer AI agent using azure:gpt-image-2. Save it and show it in Studio.
```

Example Sora 2 video request:

```text
Ask me for the missing scenario, style, duration, target platform, and continuation goal. Then generate a Sora 2 video using azure:sora-2 and save the MP4 in Studio.
```

Example audio request:

```text
Generate a professional launch voiceover with Azure Speech and save the MP3.
```

Example transcription request:

```text
Transcribe the latest generated video/audio and save the transcript report.
```

Example document request:

```text
Create a DOCX one-page product brief from this plan and save it in generated documents.
```

---

## VS Code Desktop vs VS Code Web

### Desktop: full autonomous mode

Use Desktop for local tools:

- Terminals/builds/tests.
- File system edits.
- Docker.
- SSH.
- Git operations.
- Local Ollama.
- MCP subprocesses.
- Local media/document tooling.

### vscode.dev/github.dev: web compatibility mode

VS Code for the Web runs extensions in a browser sandbox. Sentinel includes a browser-safe `extensionWeb` entry and placeholder views so the extension can install and explain limitations, but browser mode cannot run local terminals, Docker, SSH, local Ollama, or native MCP tools.

If the Marketplace says the extension is unavailable on vscode.dev, maintainers must publish the web-target package:

```powershell
cd vscode-ext
npm run compile
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.10.vsix
npm run publish:web
```

See [VS Code Web Marketplace Fix 3.16.9](docs/VS_CODE_WEB_MARKETPLACE_FIX_3_16_9.md).

---

## Commands

Command Palette commands include:

- `Sentinel Coder: Set Ollama Endpoint`
- `Sentinel Coder: Clear Chat History`
- `Sentinel Coder: Refresh Media & Document Studio`
- `Sentinel Coder: Open Media & Document Studio`
- `Sentinel Coder: Atlas Voice Bridge Status`
- `Sentinel Coder: Send Last Atlas Voice Command to Copilot`
- `Sentinel Coder: Web Compatibility Status`
- `Sentinel Coder: Why Desktop Mode Is Required`

---

## Security and privacy

- Sentinel is bring-your-own-key.
- Do not hardcode API keys, tokens, or connection strings in source.
- Use provider settings, environment variables, or git-ignored secret files.
- Review generated media/docs/code before publishing.
- Run builds/tests and targeted security scans before deployment.
- Web mode is limited intentionally to respect the browser sandbox.

---

## Full documentation

- [End-to-End User Guide](docs/END_TO_END_USER_GUIDE.md)
- [VS Code Web Marketplace Fix 3.16.9](docs/VS_CODE_WEB_MARKETPLACE_FIX_3_16_9.md)
- [Azure Cost Hard Critique and Agentic Routing Plan](docs/AZURE_COST_HARD_CRITIQUE_AND_AGENTIC_ROUTING_PLAN.md)
- [Agentic Context Cost Optimization Report](docs/AGENTIC_CONTEXT_COST_OPTIMIZATION_REPORT.md)

---

## Maintainer release verification

Before publishing:

```powershell
cd vscode-ext
npm run compile
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.10.vsix
```

Publish both Marketplace paths when releasing web compatibility:

```powershell
npm run publish
npm run publish:web
```

After publishing, verify:

- Marketplace README starts with this guide.
- Desktop VS Code installs and activates Chat + Studio.
- vscode.dev installs the extension and shows web compatibility views.
- Web limitations are clearly displayed to users.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full release history.
