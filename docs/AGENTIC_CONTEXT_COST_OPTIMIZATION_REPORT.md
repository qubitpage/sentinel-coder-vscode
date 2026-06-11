# Agentic Profiles, Dynamic Context, and Cost Optimization Report

Version: 3.16.8
Date: 2026-06-11

## What changed now

Sentinel Coder now supports configurable multi-agent workflows instead of forcing every delegation through cheap/free workers.

### Agentic Profiles

Users can create, edit, select, and delete reusable orchestration profiles from **Settings -> Agentic**.

Each profile defines:

- Main/orchestrator model.
- Worker model pool.
- Reviewer model pool.
- Default worker.
- Whether premium workers are allowed.
- Whether cheap/free fallback is allowed.
- Cost policy: `quality-first`, `balanced`, `cost-first`, or `novelty-lab`.
- Max parallel sub-agents.
- Profile-specific instructions.

Profiles appear dynamically in the chat model selector as `Agentic: <profile name>`. Selecting one routes the main chat through the profile's main model and makes sub-agent delegation use the configured worker/reviewer pools.

### Built-in starter profiles

1. **Premium Architect + Strong Agents**
   - Main: `azure:gpt-5.5`
   - Workers: `azure:gpt-4.1`, `azure:grok-4.3`, `azure:gpt-5.4`
   - Reviewers: `azure:gpt-5.5`, `azure:gpt-5.4-pro`, `azure:gpt-4.1`
   - Best for production coding, architecture, security, financial reasoning, and release work.

2. **Balanced Azure Boss + Budget Drafts**
   - Main: `azure:gpt-4.1`
   - Workers include Azure/Grok plus selected budget models.
   - Best for normal coding where quality matters but drafts/research can be delegated cheaply.

3. **Cost-Saving Research Swarm**
   - Main/reviewer: Azure premium models.
   - Workers: Groq/OpenRouter free or low-cost models.
   - Best for low-risk brainstorming, extraction, alternatives, and first-pass research.

4. **Novelty Lab: Diverse Opinions + Premium Judge**
   - Diverse models generate competing approaches.
   - Premium main model ranks, merges, and verifies.
   - Best for strategy, architecture alternatives, critique, and product planning.

## Automatic Dynamic Context

Sentinel Coder now has a Copilot-style dynamic context system controlled from **Settings -> Context**.

It can automatically add a bounded, refreshed context block to each turn with:

- Active file or current selection preview.
- Open editor tabs.
- Current VS Code diagnostics.
- Git status.
- Recent diff summary.
- Provider/model metadata.
- Active agentic profile metadata.

The context is character-bounded to avoid runaway token spend. The default budget is 12,000 characters, configurable via the UI and VS Code settings.

## Cost-saving and efficiency methods recommended for this workspace

### 1. Risk-tiered model routing

Use premium models only where they materially reduce rework or risk:

- High risk: production edits, architecture, security, deployments, financial/legal strategy, data-loss operations.
- Medium risk: tests, refactors, API integration, schema changes.
- Low risk: extraction, summarization, file inventory, brainstorming, boilerplate drafts.

Recommended profile:

- Default for serious coding: **Premium Architect + Strong Agents**.
- Default for routine work: **Balanced Azure Boss + Budget Drafts**.
- Default for research-heavy exploration: **Cost-Saving Research Swarm**.

### 2. Premium reviewer, cheap draft pattern

For low-risk parallel work:

1. Free/cheap agents draft alternatives.
2. Main premium model reviews and rejects weak output.
3. Main model applies final code with tools.
4. Build/tests/diagnostics verify the result.

This saves credits while preventing cheap agents from shipping final code.

### 3. Dynamic context budget instead of full repo stuffing

Do not paste the whole workspace into every turn. The current implementation sends a compact snapshot only:

- Focused active editor/selection.
- Open tabs.
- current diagnostics.
- Git/diff summary.

Recommended default: 12k-20k characters. Increase only for long debugging sessions.

### 4. Semantic codebase search before broad reads

For large workspaces, prefer ranked codebase search before reading many files. This reduces input tokens and avoids confusing the model with unrelated files.

Recommended future enhancement:

- Maintain an embedding index of symbols, filenames, imports, and recent edits.
- Auto-inject only the top-k snippets for the user request.
- Re-index changed files incrementally.

### 5. Context-change hashing

The dynamic context block already hashes its content and labels whether it changed. Future optimization:

- If unchanged, send a short reference instead of the full block for providers that support prompt caching or conversation state.
- Use provider-specific cache-control headers where supported.

### 6. Provider telemetry and spend-aware routing

Current provider layer tracks estimated per-session requests/input/output tokens. Recommended next step:

- Show a small cost dashboard in Settings -> Providers.
- Add per-profile spend caps.
- Auto-downgrade low-risk workers when daily budget exceeds threshold.
- Auto-escalate only failed/uncertain cheap results to premium reviewers.

### 7. Novelty routing for brainstorming only

Diverse cheap/free models are useful for ideation because different models fail differently. They should not be trusted for final code, security, or business-critical financial claims without premium review.

Recommended usage:

- Ask 3-5 diverse workers for independent options.
- Ask premium reviewer to rank by feasibility, risk, cost, and speed.
- Main model implements only the selected option.

### 8. RAG memory policy

Recommended:

- Ingest durable project docs, architecture notes, release procedures, and user preferences into RAG.
- Do not ingest transient logs or huge build outputs permanently.
- Use retrieval summaries instead of full raw docs unless exact text is required.

### 9. Tool-output compression

Future enhancement:

- Collapse long build/test logs into structured summaries:
  - command
  - exit code
  - failing file/line
  - first error
  - last error
  - suggested next action
- Keep full logs available on disk but inject summaries into model context.

### 10. Verification-first loop control

The extension already encourages real builds/tests and avoids claiming success with diagnostics errors. Recommended next improvement:

- Store per-turn verification checklist.
- Auto-run focused compile/lint for touched files when available.
- Stop delegation loops after repeated equivalent failures.

## Best recommended setup for your case

Given you have Azure premium models and want quality:

1. Use **Premium Architect + Strong Agents** for serious codebase changes.
2. Use **Balanced Azure Boss + Budget Drafts** for normal development.
3. Use **Cost-Saving Research Swarm** only for background research, extraction, or idea generation.
4. Keep Dynamic Context enabled with 12k-20k character budget.
5. Use premium reviewers for security, deployment, release, finance, and architecture.
6. Avoid using free Qwen-style workers as the default for hard critique or production code.

## Future backlog

Recommended follow-up tasks:

- Add a visual Agentic Profile run trace showing which model handled each delegated task.
- Add per-profile spend budgets and risk rules.
- Add semantic embedding index with incremental refresh.
- Add prompt caching support for providers that support it.
- Add log summarization/compression before reinjecting tool output.
- Add automatic profile recommendation based on task classification and user budget.
- Add evaluation harness comparing profiles on correctness, latency, and estimated cost.


## VS Code Web compatibility research and implementation note

Reference studied: https://code.visualstudio.com/api/extension-guides/web-extensions

### Key web-extension constraints

VS Code Web extensions run in a browser/web worker extension host. They cannot use Node.js-only APIs such as:

- `fs`, `path` filesystem access by local absolute path.
- `child_process` / local terminal process control.
- Native `http` servers bound to localhost.
- Direct SSH/Docker CLI execution.
- Desktop-only local binary integrations.

They should instead use browser-compatible APIs such as:

- `vscode.workspace.fs` for workspace URI operations where available.
- `fetch` / web APIs for network calls.
- A `browser` entry point in `package.json`.
- Conditional desktop/web feature gates for commands that need local processes.

### Sentinel implementation decision

Sentinel Coder's full autonomous desktop agent intentionally depends on local terminal, filesystem, SSH, Docker, media tools, and persistent shell access. Loading that desktop host directly in vscode.dev would fail or create unsafe misleading behavior.

Therefore v3.16.1 adds a separate browser-safe `src/extensionWeb.ts` entry point and `package.json` `browser` metadata. In Web mode Sentinel activates safely, explains the sandbox limits, and points users to Desktop VS Code for full agent mode.

Recommended future enhancement: add a true web-native lightweight chat mode using remote provider APIs plus `vscode.workspace.fs`, while explicitly hiding/disable-running local tools that are impossible in the browser sandbox.

## Focus-safe editing fix

Issue observed by user: while Sentinel was modifying files, VS Code focus moved from the chat input into opened files, causing typed chat text to land in source files.

Fix implemented: all agent-created/opened document paths now call `vscode.window.showTextDocument` with `preserveFocus: true` so file previews/edits do not steal keyboard focus from the webview chat textarea.

Remaining UX recommendation: when future commands intentionally focus a file for manual review, provide an explicit button such as **Open and focus file** instead of focusing automatically during an agent run.

## Recommended next-stage automatic context upgrades

1. **Provider metadata auto-refresh**
   - Periodically refresh available model lists, context windows, output limits, modalities, prices, and provider health.
   - Store a short hash/version so unchanged provider metadata is not re-sent every turn.

2. **Semantic codebase index**
   - Maintain an incremental index of file paths, symbols, imports, exports, recently edited files, and embeddings.
   - Before each turn, retrieve top-k files/snippets relevant to the request instead of stuffing broad workspace text.

3. **Tool-result summarizer**
   - Compress long build/test/tool outputs into structured summaries for the next model turn.
   - Keep raw logs on disk for audit; inject only error roots, touched files, exit codes, and next actions.

4. **Spend-aware profile router**
   - Track estimated input/output tokens and cost by profile/model/task.
   - Add daily/session caps and downgrade low-risk workers when budget thresholds are reached.
   - Escalate to premium only after cheap/medium workers fail confidence checks or when task risk is high.

5. **Prompt-cache strategy**
   - For providers that support prompt caching, keep stable system/project/context blocks deterministic and separate from volatile user/tool text.
   - Replace unchanged dynamic context with compact references where safe.

6. **Quality telemetry**
   - Record verification outcomes: compile pass/fail, test pass/fail, diagnostics count, repeated tool errors, user corrections.
   - Use this to recommend better profiles automatically over time.

7. **RAG lifecycle policy**
   - Ingest durable docs and project decisions automatically.
   - Avoid permanent ingestion of secrets, transient logs, generated artifacts, and massive dependency/build folders.
   - Add TTL or manual review for noisy memories.

## Recommended priority order for this workspace

1. Keep the new configurable Agentic Profiles as the source of truth for boss/worker/reviewer choice.
2. Keep Dynamic Context enabled but bounded to 12k-20k characters.
3. Add provider metadata auto-refresh and spend telemetry next.
4. Add incremental semantic codebase index after telemetry, because it gives the biggest token reduction on large workspaces.
5. Add a true web-native lightweight mode only after desktop packaging is stable, because the full agent requires desktop-only capabilities.

## VS Code Web compatibility recommendation

The official VS Code Web Extensions guide requires extensions running in the browser host to avoid Node.js-only modules such as `fs`, `path`, `child_process`, local HTTP servers, native terminals, SSH, Docker, and process-level MCP servers. Sentinel's full agent host depends on those desktop APIs, so the safe implementation is a split entry point:

- Desktop entry: `main: ./out/extension.js` keeps the complete autonomous tool layer.
- Web entry: `browser: ./out/extensionWeb.js` activates without Node imports, registers status/help commands, and clearly instructs users to use Desktop VS Code for full agent mode.
- Metadata: `extensionKind: ["ui", "workspace"]` lets VS Code choose the proper host.

Recommended future web-safe upgrades:

1. Add provider-only chat in web mode using `fetch` and VS Code SecretStorage.
2. Use `vscode.workspace.fs` and virtual workspace APIs for file reads/writes where allowed.
3. Gate desktop-only tools visibly in the tool registry instead of hiding them.
4. Move local RAG/semantic search to an optional hosted/Azure endpoint for web users.
5. Keep terminal/SSH/Docker/MCP process execution desktop-only unless backed by a secure remote agent service.

## Focus preservation fix

All agent-created or agent-edited file opens now pass `preserveFocus: true` to `vscode.window.showTextDocument`. This prevents a common UX failure where the user types into Sentinel chat while the agent modifies files, but VS Code moves focus into an opened editor and the user's text lands in source files.

This is especially important during long autonomous runs where the user may add additional instructions while files are being created or patched.


## Chat UX token/attention saving: reader-safe stream following

Sentinel now avoids forcing the chat panel to the latest message while the user is reading older output. This is not only a UX fix; it supports better operator review discipline during long autonomous runs:

- Users can inspect previous tool results, plans, and diagnostics without fighting the scroll position.
- The extension still auto-follows when the user is near the bottom.
- A **New output ↓** button indicates that fresh output is available without stealing attention.
- This reduces accidental typing into files together with the `preserveFocus` editor-open policy.


## 3.16.3 Update - Configured-model dropdowns for Agentic Profiles

Agentic Profile model fields now use dropdown selectors backed by the configured model registry. Main/orchestrator and default worker are single-select controls; worker and reviewer pools are multi-select controls. This removes typo-prone manual model entry while preserving legacy saved IDs when a provider is temporarily unavailable.


## 3.16.4 Update - Automatic live provider context-window metadata

Sentinel now refreshes model context-window and max-output metadata from live provider model APIs where available (OpenRouter live catalog plus Azure/OpenAI-compatible `/models` endpoints for providers that expose metadata). When providers omit context fields, Sentinel uses transparent current-model heuristics for GPT-5.x/GPT-4.1/Gemini/Grok/Claude/frontier families and preserves known effective endpoint caps. Conversation budgeting uses this refreshed model metadata so large-context models keep more useful history while small-context models still summarize safely.


## 3.16.5 verification note

When an Agentic Profile is selected, Sentinel now resolves `agentic:<profileId>` to the profile's actual main/orchestrator model before choosing the automatic context budget and max-output cap. This ensures live provider metadata such as Azure GPT-5.5 1M context or effective Grok deployment caps are applied correctly in profile mode instead of falling back to the raw `agentic:` selector value.

## 3.16.6 update - Make model usage visible and cap context spend

The extension now treats large model windows as capacity, not permission to spend the whole window on every turn. Provider metadata can advertise 1M-token context windows, but Sentinel uses the configured `sentinelCoder.contextBudgetTokens` as a deliberate ceiling and summarizes older turns when the conversation exceeds it. This prevents accidental 800K+ token prompts during long autonomous work.

Each turn now emits a second telemetry footer showing actual model usage, for example:

```text
Models used: orchestrator: azure:gpt-5.5; sub-agent: azure:gpt-4.1 ~1,420 out tok 18.4s; team agent: groq:openai/gpt-oss-120b x2 ~2,100 out tok 12.7s
```

This makes Agentic Profiles auditable: users can verify whether premium reviewers, Grok workers, Groq/OpenRouter budget agents, or local models actually ran. The 30-step continuation message also includes the same summary so users know why work paused and which models consumed time/credits.


## 3.16.7 Update - Azure Foundry discovery and hard cost critique

### What changed

- Azure OpenAI/Foundry deployment discovery now uses the live deployments API so dropdowns reflect the deployments actually present on the resource.
- Non-chat deployments are filtered from chat selectors to avoid choosing image/video/embedding deployments for text chat.
- OpenAI-compatible providers can surface live `/models` entries, so provider catalogs update automatically when the API exposes new models.
- Default context budget is now 64K tokens and Dynamic Context defaults to 8K characters. Large context windows remain available, but use requires explicit budget changes.
- Added **Azure Cost-Smart Production** as the recommended default profile for the current Azure spend pattern.

### Hard cost critique for the observed Azure usage

The current spend is dominated by GPT-5.5 input/cache-input usage. That means the expensive part is not primarily final answers; it is repeated large context being sent to the premium model. The fastest savings come from context reduction, prompt caching discipline, and not using GPT-5.5 as the default orchestrator for every step.

Recommended default routing:

1. GPT-4.1 main/orchestrator for normal code changes.
2. Grok-4.3 as challenger/reviewer for hard reasoning and alternatives.
3. GPT-5.5 only for final hard critique, architecture/security review, financial strategy, or unresolved disagreement.
4. Model Router or free/Groq OSS workers only for extraction, boilerplate, inventory, brainstorming, and first drafts.
5. Keep context at 64K by default; use 128K-256K only for deep refactors; reserve 1M for explicit whole-system audits.

### Expected impact

This does not reduce model quality where it matters. It moves expensive GPT-5.5 calls from every loop iteration to final verification/escalation points, where its extra reasoning has the highest marginal value.

## 3.16.8 Update - Authoritative live catalogs

Provider discovery is now live-first and authoritative. When Azure Foundry/OpenAI returns deployments, or an OpenAI-compatible provider returns `/models`, Sentinel uses that live list for dropdowns and treats curated catalogs as fallback-only. This prevents stale hardcoded models from appearing beside real deployments and reduces failed selections.

Cost discipline remains unchanged: large context windows are capability metadata, not an automatic spend target. Default operating budget remains 64K input tokens and 8K Dynamic Context characters. Use 128K-256K only for deep refactors and reserve 1M windows for explicit whole-system audits.
