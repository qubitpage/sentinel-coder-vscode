# Sentinel Coder One Studio Whitepaper

![Sentinel Coder One Studio enterprise hero](assets/sentinel-coder-enterprise-hero.png)

## Abstract

Sentinel Coder One Studio is an open-source Visual Studio Code extension for AI-assisted software development, multi-provider model orchestration, and media/document workflows. It combines direct single-model coding with opt-in Agentic Profiles, live provider model discovery, capability-aware native tool routing, VS Code Desktop automation, VS Code Web compatibility, and a Studio surface for generated images, video, audio, documents, presentations, and reports.

The design goal is practical: let a developer use one strong model directly when that is best, or intentionally orchestrate multiple models when critique, cost control, parallel review, or cross-provider validation adds value.

## Problem

AI coding tools are improving quickly, but teams still face recurring problems:

1. Provider lock-in.
2. Hardcoded model lists that become stale.
3. Context-window metadata that does not update when providers change deployments.
4. Tool-calling failures because providers support different parameters.
5. Expensive long-context usage without clear budgeting.
6. Weak distinction between direct model mode and multi-agent orchestration.
7. Desktop-only features that fail silently in browser-based VS Code.
8. Marketplace documentation that does not explain secure setup, keys, troubleshooting, or contribution.
9. Webview and packaging risks when extensions grow quickly.

Sentinel Coder One Studio addresses these with live provider discovery, operation-aware routing, explicit Agentic Profiles, browser capability reporting, and release-hardening discipline.

## Core architecture

### 1. Single-model full-capability mode

When a user selects a normal model, Sentinel uses that model directly. It does not secretly fan out to agents. This is important for cost, privacy, debugging, and predictable behavior.

### 2. Opt-in Agentic Profiles

Agentic Profiles define a main orchestrator, worker agents, reviewer agents, max parallelism, cost policy, premium-worker policy, and instructions. They are activated only when the user selects an `Agentic:` profile.

Example uses:

- Cheap/free workers draft options; premium reviewer checks final result.
- Azure orchestrator uses Groq/OpenRouter workers for speed.
- Local model reads sensitive code; cloud reviewer only sees sanitized summaries.
- Multiple providers critique architecture to reduce same-model blind spots.

### 3. Live provider catalog and context discovery

Providers can expose model catalogs, context windows, output limits, supported parameters, pricing metadata, and capabilities. Sentinel uses live metadata when available and falls back to curated entries only when discovery fails.

Supported/provider families include:

- Azure OpenAI / Azure AI Foundry.
- OpenAI-compatible APIs.
- OpenRouter.
- Groq.
- Anthropic.
- Mistral.
- DeepSeek.
- Together.
- HuggingFace / Featherless.
- Moonshot / Kimi.
- Ollama/local models.

### 4. Operation-aware tool routing

Not every model supports native tool calling, and not every provider accepts the same `tools` or `tool_choice` parameters. Sentinel routes tool parameters only when the selected provider/model/operation supports them, and it can learn from runtime rejection during a session.

### 5. Context and cost controls

Large context windows are valuable but expensive. Sentinel detects large windows while applying a user-controlled context budget so it does not automatically fill a million-token window every turn.

### 6. VS Code Desktop and VS Code Web

Desktop mode provides local tools: terminal, Docker, SSH, local Ollama, unrestricted file operations, and native MCP processes.

Web mode uses browser-safe APIs and can integrate with an optional Remote Tool Bridge for approved remote operations. The extension must honestly report browser limitations instead of pretending local tools exist.

### 7. Media and Document Studio

Studio organizes generated and inspected content:

- Images.
- Video.
- Speech/audio.
- Transcripts.
- Documents.
- Presentations.
- Reports.
- Templates.

The Studio helps developers keep AI-generated artifacts organized and inspectable.

## Security posture

Sentinel Coder One Studio follows these principles:

1. No API keys in source.
2. Use secret storage, environment variables, or git-ignored files.
3. Run secret scans before publishing.
4. Keep packaged VSIX artifacts clean.
5. Treat webviews as untrusted rendering surfaces.
6. Keep VS Code Web browser-safe.
7. Ask for approval before risky operations unless the user explicitly changes approval mode.
8. Document Desktop vs Web differences clearly.

## Enterprise value

### For individual developers

- One sidebar for code, terminal, docs, media, model selection, and review.
- Direct strong-model mode for focused work.
- Agentic mode for high-stakes tasks.

### For teams

- Repeatable Agentic Profiles.
- Provider selection based on cost/performance.
- Shared setup and troubleshooting docs.
- Security release checklist.

### For enterprises

- Multi-provider flexibility.
- Azure-first deployment compatibility.
- Browser/desktop distinction.
- Secret hygiene and package-hardening.
- Future-ready Remote Tool Bridge architecture.

## Cost/performance strategy

The strongest model is not always the best model for every subtask. A practical enterprise strategy is:

1. Use a strong daily orchestrator for planning and final edits.
2. Use cheap/free workers for extraction, boilerplate, test ideas, and brainstorming.
3. Use a different provider/model for hard critique and security review.
4. Reserve premium long-context models for tasks that genuinely need them.
5. Keep context budgets explicit.
6. Review actual model usage telemetry after each Agentic run.

## Roadmap

Recommended next improvements:

1. Provider contract-test fixtures.
2. Automated webview UI tests.
3. Enterprise policy files for tool allow/deny lists.
4. Signed release artifacts and SBOM/checksum publishing.
5. Remote Tool Bridge reference server.
6. More Studio templates and tutorials.
7. Accessibility and localization improvements.
8. Community-curated Agentic Profiles.

## Open source and support

Sentinel Coder One Studio is open source under the MIT license.

- GitHub: https://github.com/qubitpage/sentinel-coder-vscode
- Issues: https://github.com/qubitpage/sentinel-coder-vscode/issues
- Donate: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS

If Sentinel helps your work and you want to support frequent updates, any amount is useful to sustain development. Donations help keep the project open source, maintained, and improving.
