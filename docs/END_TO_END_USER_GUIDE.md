# Sentinel Coder One Studio - End-to-End User Guide

Sentinel Coder One Studio is a multi-provider AI coding agent and media/document studio for Visual Studio Code. It can chat, inspect a workspace, edit files, run commands, search code, generate images/video/audio, inspect documents, use RAG, orchestrate multiple models through Agentic Profiles, and run in a safe compatibility mode on VS Code for the Web.

This guide is intended for Marketplace users and extension maintainers.

Public community links:

- Repository: https://github.com/qubitpage/sentinel-coder-vscode
- Contribution guide: https://github.com/qubitpage/sentinel-coder-vscode/blob/main/CONTRIBUTING.md
- Issues and feature requests: https://github.com/qubitpage/sentinel-coder-vscode/issues

---

## 1. Install and choose the right runtime

### VS Code Desktop - full power

Use VS Code Desktop when you want autonomous work:

- File edits and generated files.
- Terminal/build/test commands.
- Docker, SSH, Git, local scripts, local Ollama, MCP servers.
- Media/document Studio with local file previews.
- Sora/image/audio generation saved into the workspace.

### VS Code for the Web / vscode.dev - compatibility mode

Sentinel also ships a browser entry point for vscode.dev/github.dev. Web mode is intentionally limited by the browser sandbox:

- The extension activates with web-safe Chat and Studio placeholder views.
- It explains which features require Desktop.
- It does not run local terminals, Docker, SSH, local Ollama, native MCP subprocesses, unrestricted filesystem operations, or local media tooling in the browser.

If vscode.dev says the extension is not available, the Marketplace needs the web-target package to be published. Maintainers should run:

```powershell
cd vscode-ext
npm run compile
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.10.vsix
npm run publish:web
```

---

## 2. First-run setup

1. Install the extension.
2. Open the Sentinel Coder One Studio activity-bar icon.
3. Open Settings inside the Sentinel sidebar.
4. Add providers and API keys.
5. Pick a model from the dropdown.
6. Choose a mode:
   - **Ask** for explanations and planning.
   - **Plan** for a proposed step-by-step plan before edits.
   - **Agent** for tool-using autonomous work.
7. Start with a small request such as: `Inspect this workspace and tell me the project type.`

Sentinel is bring-your-own-key. Do not paste secrets into source files. Prefer provider settings, environment variables, or a git-ignored secrets file.

---

## 3. Providers and model dropdowns

Sentinel supports local and cloud providers through configured provider entries.

Common provider families:

- Azure OpenAI / Azure AI Foundry.
- OpenAI-compatible endpoints.
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

### Live model discovery

When providers expose model/deployment APIs, Sentinel refreshes the model dropdown from the live provider catalog instead of relying only on hardcoded lists.

- Azure Foundry/OpenAI deployments are discovered from the live deployment API when configured.
- OpenAI-compatible providers can populate from `/models`.
- Non-chat models such as embeddings, moderation, image/video/audio-only endpoints are filtered out of chat/Agentic selectors when possible.
- Context window and output limits are refreshed from provider metadata when available, with curated fallback heuristics only when the provider does not expose enough metadata.

---

## 4. Single-model mode vs Agentic Profiles

### Standard single-model mode

Normal model dropdown selections run as direct single-model mode. The selected model works at its full detected capability, subject to your `maxTokens` and context-budget settings.

Use this when:

- You want one powerful model to solve the task directly.
- You are testing a new provider/model.
- You want predictable cost and routing.
- You do not want worker/reviewer orchestration.

### Agentic Profiles

Agentic Profiles are opt-in orchestration presets. They activate only when you intentionally choose an `Agentic:` profile from the model/profile selector.

A profile can define:

- Main/orchestrator model.
- Worker model pool.
- Reviewer model pool.
- Cost policy.
- Maximum parallel agents.
- Whether premium workers are allowed.
- Whether cheap/free fallback is allowed.
- Profile-specific instructions.

Recommended profile pattern:

- Use GPT-4.1 or another strong but cheaper model as the daily orchestrator.
- Use Grok or another adversarial model for hard critique.
- Use cheap/free workers for low-risk drafts and extraction.
- Use GPT-5.5 or other frontier models only for final review, architecture, security, finance, or unresolved disagreements.

The built-in **Standard: Single Model** profile is a reference/non-orchestrated profile. It exists so users can understand standard behavior, but it must not silently hijack ordinary single-model dropdown selections.

---

## 5. Context and cost settings

Sentinel supports large-context models but does not automatically fill giant 1M-token windows every turn.

Important settings:

- `sentinelCoder.maxTokens`
  - `0` means auto: use the selected model's detected output limit.
  - Non-zero values cap output and should not exceed the model's real limit.
- `sentinelCoder.contextBudgetTokens`
  - Default: `64000`.
  - Controls how much input context Sentinel is allowed to assemble for long sessions.
  - Increase only when you intentionally need deep context.
- `sentinelCoder.dynamicContextEnabled`
  - Enables automatic context from the active editor, open tabs, diagnostics, git status, and provider metadata.
- `sentinelCoder.dynamicContextMaxChars`
  - Default is intentionally lean to control spend.
- `sentinelCoder.dynamicContext.includeActiveFile`
- `sentinelCoder.dynamicContext.includeOpenTabs`
- `sentinelCoder.dynamicContext.includeDiagnostics`
- `sentinelCoder.dynamicContext.includeGitStatus`
- `sentinelCoder.dynamicContext.includeProviderMetadata`

Recommended budgets:

| Scenario | Suggested budget |
| --- | ---: |
| Quick chat / small edits | 16K-32K |
| Normal coding | 32K-64K |
| Multi-file refactor | 64K-96K |
| Architecture review | 96K-192K |
| Deep audit | 192K-256K |
| Exceptional full-context review | 256K+ with explicit intent |

---

## 6. Chat modes and approval modes

### Modes

- **Ask**: no autonomous edits by default; best for Q&A and explanations.
- **Plan**: Sentinel proposes a plan before acting.
- **Agent**: Sentinel can use tools to read, edit, run, test, package, and verify.

### Approval modes

- `default`: ask before tool actions and require manual Continue after safety ceilings.
- `bypass`: auto-approve safe/moderate tools, still ask for dangerous actions.
- `autopilot`: auto-approve all tools and continue automatically. Use only when you trust the task and workspace state.

---

## 7. Core coding tools

Sentinel includes tools for real development workflows:

- Create, read, edit, append, and delete files.
- List directories and search files/text.
- Codebase search for natural-language location of relevant files.
- Get active file, selection, diagnostics, open tabs, workspace info.
- Run shell commands in a persistent terminal session.
- Serve local HTML files and open a browser.
- Git status, diff, log, commit, and push.
- Docker CLI operations.
- SSH remote commands.
- HTTP requests and web search.
- RAG ingest/query.
- Security/firewall scanning for secrets, injection risks, unsafe HTML, destructive commands, and debug code.

Typical request examples:

```text
Inspect this workspace, identify the framework, and run the correct build command.
```

```text
Find where authentication is implemented, explain the flow, then propose a safe refactor plan.
```

```text
Fix the failing TypeScript compile, run the build, and summarize the exact files changed.
```

---

## 8. Media & Document Studio

The Studio view is the native workspace for generated and inspected assets.

It can help you:

- Browse generated images, videos, audio, documents, reports, data, presentations, and templates.
- Preview media inside VS Code.
- Inspect PDFs, Office documents, images, audio, and video metadata when local tools are available.
- Save generated outputs under `.sentinel/generated/`.
- Create version snapshots for edited text/data files.
- Send selected files/content back to chat for summarization, rewrite, OCR, transcription, regeneration, or transformation.

Generated folder layout:

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

Open Studio from:

- Activity bar: Sentinel Coder One Studio -> Studio.
- Command Palette: `Sentinel Coder: Open Media & Document Studio`.
- Chat media cards: `View in Studio`.

---

## 9. Image generation

Supported tool:

- `generateImage`

Typical providers/models:

- `azure:gpt-image-2`
- `azure:MAI-Image-2e`

Example prompts:

```text
Generate a premium web hero image for a quantum AI developer platform. Use generateImage with azure:gpt-image-2 and show me the saved path.
```

```text
Create a polished commercial product visual for a VS Code AI agent marketplace listing. Save it to Studio.
```

Outputs are saved under `.sentinel/generated/images/` and can be opened in Studio.

---

## 10. Video generation with Azure Sora 2

Supported tool:

- `generateVideo`

Typical model:

- `azure:sora-2`

Sentinel's Sora workflow asks for:

- Scenario.
- Style.
- Duration.
- Target platform/aspect ratio.
- Continuation goal if the clip continues a previous shot.
- Whether in-scene speech is needed.
- Camera/mood/setting details.

Example prompt:

```text
Ask me the missing creative details, then generate a 12-second vertical Sora 2 video for a premium Sentinel Coder One Studio launch teaser. Save the MP4 and show it in Studio.
```

Quality guidance:

- Be specific about setting, movement, camera, lighting, brand mood, and pacing.
- Avoid asking for unreadable text overlays.
- For presenter scenes, let Sora generate in-scene speech naturally unless you explicitly ask for external voiceover.
- Use continuation notes when building a multi-shot campaign.

Outputs are saved under `.sentinel/generated/videos/`.

---

## 11. Audio and transcription

Supported tools:

- `generateSpeech`
- `transcribeAudio`

Speech generation:

```text
Generate a short professional voiceover for the Sentinel Coder One Studio launch using Azure Speech. Save the MP3 and show me the path.
```

Transcription:

```text
Transcribe the latest generated video/audio and save the transcript report.
```

Outputs:

- Audio: `.sentinel/generated/audio/`
- Transcripts/reports: `.sentinel/generated/reports/`

---

## 12. Document and Office workflows

Supported tools include:

- `inspectFile` for PDFs, Office files, images, audio, and video.
- `createOfficeDocument` for basic DOCX/XLSX/PPTX generation.
- `prepareGeneratedWorkspace` for organized generated folders.

Example prompts:

```text
Inspect this PDF and summarize the key obligations and risks.
```

```text
Create a DOCX one-page investor memo from this plan and save it in generated documents.
```

```text
Create a PPTX outline for a five-slide pitch deck and save it in generated presentations.
```

---

## 13. RAG and knowledge base

Sentinel can ingest files or text into a local knowledge base and query it later.

Use it for:

- Project architecture notes.
- Long docs.
- Research excerpts.
- Reusable team conventions.

Example:

```text
Ingest docs/architecture.md into RAG, then answer future questions using it as context.
```

---

## 14. Security and verification workflow

For production work, ask Sentinel to:

1. Reproduce the issue.
2. Patch minimally.
3. Run compile/tests/build.
4. Run diagnostics.
5. Run targeted firewall/security scan.
6. Summarize exact evidence.

Example:

```text
Fix the bug, run npm run build, run a targeted security scan on changed files, and do not call it done if anything fails.
```

The firewall scan can detect suspicious secrets, unsafe HTML, injection risks, destructive commands, and debug code. Always review findings manually before publishing.

---

## 15. Marketplace/public documentation checklist for maintainers

Before publishing:

```powershell
cd vscode-ext
npm run compile
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.10.vsix
```

Check the packaged README:

```powershell
tar -tf sentinel-coder-web-3.16.10.vsix | Select-String "extension/readme.md"
```

Publish:

```powershell
npm run publish
npm run publish:web
```

After publishing:

- Open the Marketplace listing and confirm the README begins with the current guide.
- Open vscode.dev and search for Sentinel Coder One Studio.
- Confirm web mode is installable and shows the web compatibility view.
- Confirm Desktop still activates full Chat and Studio functionality.

---

## 16. Troubleshooting

### The extension is unavailable on vscode.dev

Publish the web-target artifact with `npm run publish:web` and wait for Marketplace indexing/cache refresh. Confirm the packed VSIX contains:

- `browser: ./out/extensionWeb.js`
- `extensionKind` including `ui`
- `out/extensionWeb.js`
- `capabilities.virtualWorkspaces`
- `capabilities.untrustedWorkspaces`

### A model is missing from the dropdown

- Check provider API key/base URL.
- Refresh providers/models in the Sentinel settings panel.
- Confirm the provider exposes a `/models` or deployment catalog API.
- Confirm the model is chat-capable; non-chat media/embedding/moderation models may be filtered out of chat selectors.

### Cost is too high

- Use single-model GPT-4.1-class or a cost-smart Agentic Profile for routine work.
- Keep `contextBudgetTokens` near 64K unless deep context is required.
- Keep dynamic context lean.
- Use GPT-5.5/frontier models for final review and high-risk escalation, not every draft.

### Agentic orchestration starts when you expected one model

Use a normal model dropdown entry for single-model mode. Agentic orchestration should activate only when you choose a real `Agentic:` profile.

---

## 17. Privacy and keys

- Sentinel is bring-your-own-key.
- Do not commit keys to source control.
- Use provider settings, environment variables, or git-ignored secret files.
- Review generated artifacts before publishing.
- Run a secret scan before packaging or deployment.
