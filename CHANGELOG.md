## 3.16.12 - Enterprise Documentation, Webview Hardening + Marketplace Release Pack

- Hardened the Chat sidebar webview by removing direct raw `innerHTML` assignments from dynamic UI renderers, replacing them with DOM-safe builders or centralized trusted-fragment rendering for already-sanitized Markdown/media fragments.
- Hardened the Studio webview render paths for file trees, selected-file previews, and version history so workspace-controlled names, paths, and previews are rendered through text/attribute APIs.
- Added enterprise documentation hub with setup, provider/API-key guidance, model selector strategy, Agentic Profiles, Studio/media workflows, VS Code Web/Remote Tool Bridge guidance, troubleshooting, security, and release checklist.
- Added public whitepaper, pitch deck, hard self-critique/roadmap, donation/support page, PayPal donation link, QR code, generated hero image, and Office presentation assets for GitHub and Marketplace users.
- Reverified single-model full-capability mode, opt-in Agentic Profiles, live model dropdowns, free/provider Agentic presets, operation-aware tool routing, and VS Code Web Remote Tool Bridge manifests.
- Rebuilt desktop and web VSIX packages with archive hygiene checks so scripts, tests, source, scratch folders, PowerShell helpers, and inspection artifacts are not shipped in Marketplace packages.
- Hardened Marketplace-facing documentation around secret hygiene: do not publish API keys, local VS Code storage, private provider files, or customer data.
- Preserved 3.16.11 provider/tool capability fixes while preparing a clean 3.16.12 publish target for desktop and VS Code Web packages.

## 3.16.11 - Operation-Aware Native Tools + GPT-5.5 Single-Model Stability

- Added operation-aware native-tool routing so Sentinel does not send OpenAI-style `tools`/`tool_choice` parameters to provider/model combinations that do not advertise or support that operation.
- Fixed the Azure/OpenAI Foundry GPT-5.5 single-model chat failure where the provider returned `400: The requested operation is unsupported` when native tool calling was attempted.
- Preserved native tools for models that do support them, such as Azure GPT-4.1, while disabling unsupported native-tool operations for GPT-5.x/Grok/router-style deployments unless live provider metadata proves support.
- Added runtime learning: if a provider rejects a native-tool operation, Sentinel disables native tools for that exact model/deployment for the current VS Code session and retries the turn as normal streaming chat.
- Made OpenRouter/OpenAI-compatible routing respect live `supported_parameters` metadata, including omitting `tool_choice` when a model supports `tools` but not `tool_choice`.
- Added durable provider-capability regression tests and excluded `tests/**` from packaged VSIX artifacts.
- Cleaned the Agentic Profile editor so empty/new custom profiles no longer silently inject hardcoded Azure worker/reviewer defaults; model selection comes from live configured dropdowns.

## 3.16.10 - Deterministic Agentic Profiles + Live Agent Dropdowns

- Added deterministic Agentic Profile preflight for substantial Agent-mode requests: when a real `Agentic:` profile is selected, Sentinel proactively runs the profile worker and, for high-risk tasks, reviewer preflight before the main orchestrator response instead of waiting for the LLM to voluntarily call delegation tools.
- Preserved standard single-model behavior: normal model selections still use the selected model directly at its detected capability and do not auto-orchestrate.
- Fixed Agentic Profile settings regression by using live provider/model dropdowns for the main orchestrator plus multi-select worker/reviewer agent pools.
- Added preservation for open Agentic profile editor selections while live provider discovery refreshes the model registry.
- Improved Agentic profile cards so selected worker agents, default worker, reviewer agents, policy, and max parallel settings are visible at a glance.
- Restored a clearly visible **Add follow-up** button state while an agent run is active so users can queue additional instructions without stopping the current run.
- Kept the web-compatible package path and manifest verification workflow for vscode.dev/VS Code Web.

## 3.16.9 - Standard Single-Model Mode + VS Code Web Marketplace Packaging

- Added public GitHub community links for Marketplace users: repository, issues/feature requests, and a contribution guide at `https://github.com/qubitpage/sentinel-coder-vscode`.
- Added a built-in **Standard: Single Model** Agentic profile reference while keeping normal model selections truly single-model: the selected model now works at its full detected capability unless the user explicitly chooses a real `Agentic:` orchestration profile.
- Fixed Agentic profile activation so stored/current profiles no longer silently hijack ordinary model dropdown selections.
- Added explicit desktop and web VSIX packaging scripts: `npm run package:desktop` and `npm run package:web`.
- Added `npm run publish:web` and `npm run verify:web-manifest` so the Marketplace receives a web-target artifact with `browser`, `extensionKind`, workspace capability declarations, and `out/extensionWeb.js` included.
- Documented the vscode.dev fix path in `docs/VS_CODE_WEB_MARKETPLACE_FIX_3_16_9.md`: if vscode.dev still says the extension is unavailable, publish the 3.16.9 web-target VSIX and allow Marketplace indexing/cache refresh.

## 3.16.8 - Authoritative Live Provider Catalogs

- Changed Azure Foundry/OpenAI deployment discovery so a successful live deployment API response is authoritative. Static Azure models are now fallback-only instead of being appended to live deployments.
- Changed OpenAI-compatible provider discovery so successful `/models` catalogs are authoritative for Groq, OpenAI, Mistral, DeepSeek, Together, Vultr, HuggingFace/Featherless, Moonshot, and custom OpenAI-compatible providers. Curated lists remain offline fallback only.
- Hardened live model metadata parsing for provider variants that expose `max_tokens`, `top_provider.max_tokens`, output modalities, or non-standard architecture fields.
- Kept chat/Agentic dropdowns safe by filtering non-chat models such as embeddings, image/video/audio/speech/moderation/rerank entries.
- Preserved the Azure Cost-Smart Production profile, 64K default context budget, 8K Dynamic Context default, and visible orchestrator/sub-agent usage telemetry.

## 3.16.7 - Azure Foundry Live Deployment Discovery + Cost-Smart Defaults

- Added live Azure OpenAI/Foundry deployment discovery so every chat-capable deployment returned by the API appears in the model dropdown and Agentic dropdown selectors.
- Filtered non-chat Azure deployments (embeddings, image, video, audio, moderation) out of chat/model selectors so selected models work with Sentinel chat completions.
- Added live `/models` catalog discovery for OpenAI-compatible providers beyond OpenRouter while preserving curated fallback entries.
- Added **Azure Cost-Smart Production** Agentic Profile: GPT-4.1 main orchestration, Grok-4.3 hard worker/reviewer, Model Router/free workers for low-risk drafts, GPT-5.5 only for high-risk final review.
- Lowered default long-session context budget from 96K to 64K tokens and Dynamic Context from 12K to 8K characters for better Azure credit discipline without giving up large-context capability.
- Verified current Azure Foundry deployments with Azure CLI and documented the cost critique/recommended routing plan.

## 3.16.6 - Agent model-usage telemetry + credit-safe context budgeting

- **Visible Agentic model usage**: each turn now reports the actual orchestrator plus sub-agent/team models used, including call counts, approximate sub-agent output tokens, and elapsed time where available.
- **Better max-step continuation message**: when a turn pauses at the 30-step safety ceiling, Sentinel now explains that it paused to protect context/time/credits and includes the models used before asking you to Continue.
- **Credit-safe long-context policy**: Sentinel still detects large provider windows such as Azure GPT-5.5/GPT-5.4/GPT-4.1-class 1M contexts, but it no longer automatically fills enormous windows every turn. The user-controlled `sentinelCoder.contextBudgetTokens` setting is the ceiling; raise it only when you intentionally want deep long-context work.
- **Agentic Profile auditability**: turn footers make it obvious whether selected profiles are using premium Azure/Grok reviewers or cheaper/free workers, so you can tune quality vs. spend.
- Builds on 3.16.5 Web Platform availability fixes, 3.16.4 live provider context metadata, and 3.16.3 dropdown-based Agentic model selectors.

## 3.16.5 - Corrected VS Code Web Platform Compatibility

- Fixed the Marketplace/Web installability path by making the extension browser-first UI compatible and declaring explicit limited support for virtual and untrusted workspaces.
- Added web-safe Chat and Studio placeholder webview providers in `extensionWeb.ts` so contributed views activate in vscode.dev/github.dev without importing Node-only desktop agent code.
- Registered all contributed commands in web mode with clear Desktop-required guidance instead of leaving commands unresolved.
- Preserved the full autonomous desktop extension entry for terminals, local filesystem tooling, SSH, Docker, Ollama, MCP, RAG, media/document tooling, builds, packaging, and tool execution.
- Fixed Agentic Profile context budgeting so the selected profile resolves to its main model before applying live/effective context-window metadata.

## 3.16.4 - Automatic Live Context-Window Metadata

- Added provider-aware model metadata refresh so Sentinel uses live `/models` context/max-output fields when providers expose them.
- Merged live metadata into configured providers including Azure/OpenAI-compatible endpoints, Groq-compatible catalogs, OpenRouter live catalog, Featherless/Together/Vultr/HuggingFace/Mistral/DeepSeek/custom OpenAI-compatible providers.
- Added cached metadata refresh with safe fallback heuristics for providers that list models but do not expose context fields.
- Updated GPT-5.5/GPT-5.4/GPT-4.1-class heuristics to 1M context and added Grok 4.2/4.3 heuristics while preserving known endpoint effective caps.
- Long-session budgeting now benefits from refreshed context metadata and keeps more history on large-context models without overflowing smaller models.

## 3.16.3 - Agentic Model Dropdown Selectors

- Replaced manual text entry for Agentic Profile model fields with dropdown selectors populated from the configured model registry.
- Added multi-select controls for worker and reviewer pools so users can choose existing Azure/Groq/OpenRouter/local/etc models without typo-prone copy/paste.
- Preserved backward compatibility for saved profiles whose model IDs are not currently present in the configured provider list by keeping them visible as legacy options.
- Continued to package the 3.16.2 reader-safe streaming scroll, 3.16.1 Dynamic Context, Agentic Profiles, VS Code Web compatibility, and focus-safe edit improvements.

## 3.16.2 - Reader-Safe Streaming Chat Scroll

- Fixed Sentinel chat output auto-scroll behavior while an agent is still working: if the user manually scrolls up to read previous output, new streamed tokens/tool updates no longer yank the panel back to the latest message.
- Added a lightweight **New output ↓** jump button that appears only when fresh output arrives while the user is pinned away from the bottom.
- Preserved automatic following when the user is already near the bottom, so normal live-chat behavior still feels natural.
- Kept the 3.16.1 Agentic Profiles, Dynamic Context, VS Code Web compatibility mode, and focus-safe file editing changes.

## 3.16.1 - Web Compatibility, Focus-Safe Edits, and Dynamic Context Settings

- Added a VS Code Web/browser extension entry point and `extensionKind` metadata so Sentinel loads safely in vscode.dev/github.dev compatibility mode instead of attempting Node-only desktop activation.
- Added Web compatibility status/help commands that explain which features require Desktop VS Code: terminal, SSH, Docker, local Ollama, local filesystem server, MCP processes, and desktop media tooling.
- Made all agent-driven `showTextDocument` file opens focus-safe with `preserveFocus: true` so edits/previews do not steal typing focus from Sentinel chat.
- Exposed automatic Dynamic Context controls as VS Code settings in addition to the in-webview Settings → Context UI.
- Updated marketplace README/reporting for Agentic Profiles, automatic context refresh, cost-saving orchestration, web compatibility, and focus-safe editing.

### 3.16.1 additional Agentic/Dynamic Context details

- Added user-editable Agentic Profiles with CRUD UI in Settings → Agentic. Profiles define main/orchestrator, worker, reviewer, fallback, max parallel, and cost policy.
- Profiles appear dynamically in the model selector as `Agentic: ...` and route chat/delegation through the selected profile instead of hardcoded cheap/free workers.
- Added automatic Dynamic Context settings for active file/selection, open tabs, diagnostics, git status, recent diff summary, and provider/model metadata with bounded token-saving context injection.

## 3.15.29 - Azure Grok Live Context Guard

- Added a Grok 4.3 live request cap so Azure/Foundry prompts are trimmed below the observed 200K endpoint limit while still showing the configured 322K display context.
- Preserves recent user/tool context and inserts a compact preflight note instead of failing with Azure invalid prompt length errors.

# Changelog

## 3.15.28 - 2026-06-09

### Fixed
- Chat paste handling now preserves terminal/compiler error text such as `/usr/bin/systemctl: cannot execute binary file` instead of hiding it as an attachment.
- Only clear standalone file paths or quoted/file URI paths become attachment chips; pasted logs remain visible and editable in the input.

## 3.15.27 - Sora 2 Quality Policy and Presenter Workflow

- Strengthened Azure Sora 2 prompt defaults with built-in premium positive quality directives and comprehensive negative prompt guards.
- Media Studio now guides users to choose scenario, presenter/dialogue style, target platform, continuation goal, and whether speech should be generated natively by Sora.
- Clarified that Sora presenter videos should use in-scene generated speech; external voiceover overlays are not added unless explicitly requested.
- Kept Azure gpt-image-2, MAI-Image-2e, Sora 2, Speech TTS, and Speechmatics workflows visible in the chat Media Studio panel.

## 3.15.26

- Fixed Azure CLI invocation on Windows by using `cmd.exe /c az ...` instead of spawning `az.cmd` directly, avoiding `EINVAL` in VS Code extension hosts.
- Added scenario-driven Sora 2 workflow wording: choose scenario, style, duration, target platform and continuation goal before generating video.
- Verified Sora 2 social promo generation workflow and deterministic caption/voiceover finalization path for readable promotional output.
- Refreshed Marketplace overview to describe Sentinel Coder One Studio media/design workflows accurately.

## 3.15.25

- Added clearer scenario-choice workflow text for Sora 2 video generation: users should choose scenario, style, duration, target platform, and continuation goal before generation.
- Verified a 12-second vertical Sora 2 video generation workflow and documented saved MP4/player output expectations.
- Refreshed Marketplace overview language for scenario-driven Sora 2 media studio workflows.

## 3.15.21 - Studio scrolling and Azure-first worker orchestration

- Fixed Studio split-pane scrolling so the left file navigator and right preview/editor can scroll independently in large workspaces.
- Added Azure GPT-5.4 Pro and GPT-5.4 to the selector/routing metadata after verifying deployments exist in Azure.
- Updated hard-task worker routing to prefer Azure GPT-5.4 Pro, GPT-5.4, GPT-4.1, and Azure Grok 4.3 before external/free fallbacks, while keeping GPT-5.5 as final boss reviewer.
- Kept free/cheap workers as draft/research helpers only for difficult design, production, security, release, and architecture tasks.

## 3.15.20

- Studio v2: added version-history listing/restore for editable files.
- Added Studio comments/annotations foundation saved under `.sentinel/studio-comments.json`.
- Improved in-viewer AI actions so selected content can be sent directly to Sentinel Chat.
- Kept generated media players, workspace file navigator, templates, and Sora storyboards from the Studio foundation.

## 3.15.15

- Added dedicated Azure Foundry Sora 2 provider settings with endpoint/key save and lightweight connection test.
- Updated `generateVideo` to prefer the saved Sora provider configuration while retaining Azure CLI/resource fallback.
- Documented the tested `/openai/v1/videos` Sora route and generated-video workflow.


## 3.15.14 - Tested media + boss-worker release

- Added/validated Azure image generation paths for `gpt-image-2` and `MAI-Image-2e`.
- Added/validated Azure Speech TTS and Speechmatics transcription workflow.
- Added agent-facing screenshot/OCR diagnostic foundations.
- Improved media/document preview foundations and organized generated-content folders.
- Hardened boss-worker routing policy: free workers draft; premium models review complex/design/security/production work; GPT-5.5 remains final reviewer.
- Updated README with tested provider/media capabilities and removed stale competitor positioning.
- Validated with local build, provider/media smoke tests, design pipeline proof, and VSIX scan before publish.


## 3.15.13

- Added media/document preview foundations for chat attachments with webview-safe URIs.
- Added generated-content workspace preparation tool for images, videos, audio, documents, presentations, data, reports and templates.
- Added model selector modality badges: Text, Code, Reason, Vision, Image, Video and Audio.
- Continued staged foundation work for Office/PDF/media productivity workflows.

## 3.15.12

- Added Featherless as a first-class OpenAI-compatible provider with Pro-account model entries and capability metadata.
- Verified Featherless live API access using a local git-ignored key source without printing secrets.
- Improved chat file handling for Explorer/clipboard paths: pasted or dropped Windows paths are inserted visibly as local file references, while images/files still save under `.sentinel/attachments`.
- Preserves queued additional input, visible attachment chips, detailed firewall scan output, and corrected approval-mode semantics.

## 3.15.11

- Fixed detailed `firewallScan` text output after the 3.15.10 UI/firewall polish patch.
- Firewall scans now report target, file counts, skipped file counts, scanned-path previews, and finding summaries in readable chat output.
- Keeps visible attachments and queued follow-up input behavior from 3.15.10.

## 3.15.10

- Corrected Marketplace metadata/README encoding so public text renders cleanly.
- Improved visible attachment chips and queued additional input behavior while an agent run is active.
- Improved `firewallScan` output with target, scanned counts, scanned path preview, severity summary, and top findings.
- Kept approval-mode semantics from 3.15.9: Default manual, Bypass auto-approves safe/moderate only, Autopilot auto-approves and auto-continues.


## 3.15.9

- Clarified approval-mode behavior: Default is manual, Bypass auto-approves safe/moderate actions only, Autopilot auto-approves and auto-continues.
- Added queued additional input while an agent run is active.
- Improved attachment visibility with saved local paths and attachment chips.
- Improved firewall scan summaries with scanned target, file counts, path previews, severity counts, and findings.
- Cleaned Marketplace/README encoding so public text renders correctly.


## [3.15.9] — 2026-06-08

### Fixed
- **Approval mode semantics now match the UI contract** — `default` requires manual approvals and manual Continue; `bypass` auto-approves safe/moderate tools such as reads, searches, terminal commands and edits while still asking for dangerous operations and keeping Continue manual; `autopilot` auto-approves every tool and auto-continues through step ceilings until the job finishes or hits the safety cap.

### Verified
- Static checks confirm `bypass` no longer auto-continues at step ceilings; only `autopilot` auto-resumes automatically.
- Tool approval logic auto-approves non-dangerous tools in `bypass` and all tools in `autopilot`.

## [3.15.8] — 2026-06-08

### Fixed
- **VS Code webview modal reliability** — replaced remaining browser `prompt()` / `confirm()` calls in Ollama model management with Sentinel's in-webview modal helpers. This avoids VS Code webview no-op dialogs and improves parity with Copilot-style polished chat UX.

### Verified
- Webview JavaScript syntax check passes.
- Static scan confirms no raw `prompt()` / `confirm()` / `alert()` calls remain in the webview script.

## [3.15.7] — 2026-06-08

### Fixed
- **Firewall toggle is now host-enforced** — when the chat toolbar Firewall toggle is enabled, Sentinel runs the native `firewallScan` tool after the turn and posts the scan summary automatically. It no longer relies only on prompt instructions to the model.

### Verified
- TypeScript compile passes after host-enforced scan wiring.

## [3.15.6] — 2026-06-08

### Added
- **Security Firewall scan tool** — a native Sentinel/IBM-Bob-style `firewallScan` tool can scan files or supplied text for likely secrets, prompt-injection strings, unsafe HTML/script patterns, dangerous shell commands, debug leftovers, and high-risk deployment/publish changes. It returns a health score and severity summary so agents can use it as an approval gate before commits, publishes, and deploys.
- **Chat toolbar helpers** — added visible chat controls for image/file attachment, clipboard path insertion, and a Firewall toggle that instructs the agent to run the scanner before finalizing risky work.
- **Real attachment saving** — image/file uploads, pasted screenshots, and dropped files are saved under the workspace `.sentinel/attachments` folder (or extension storage when no workspace is open) and inserted into the prompt as local paths for agent review.

### Changed
- **Safer formatted Markdown rendering** — assistant responses now escape raw HTML before Markdown formatting, reducing webview injection risk while keeping headings, code blocks, tables, lists, links, and copy/run/create buttons readable.
- **Marketplace README refresh** — audited the real extension capabilities and rewrote the positioning against GitHub Copilot: Copilot remains stronger at inline autocomplete and GitHub-native PR workflows; Sentinel Coder is optimized for agentic execution, multi-provider routing, terminal/SSH/Docker/cloud tools, security gates, and credit-saving workers.

### Verified
- TypeScript compile passes.
- Webview script syntax passes.
- Firewall scanner and attachment bridge are present in compiled output.
- VSIX/output secret scan passes before publish.

All notable changes to the Sentinel Coder extension will be documented in this file.
## [3.15.5] — 2026-06-08

### Fixed
- **Chat abort race crash** — streaming paths now tolerate a cleared abort controller instead of throwing `Cannot read properties of null (reading 'signal')` when a turn is stopped, auto-continued, or cleaned up while async provider/tool work is still unwinding.

### Verified
- TypeScript compile passes after the null-signal fix.
- Provider and sub-agent smoke tests were rerun against Groq, OpenRouter/free, and Azure paths.

## [3.15.4] — 2026-06-08

### Added
- **OpenRouter Free Models Router** — `openrouter/free` is explicitly listed as a `FREE` dynamic router in the model selector and Boss Orchestrator worker routing.

### Verified
- Live `openrouter/free` smoke test passed with HTTP 200 and selected `openai/gpt-oss-120b:free` from OpenRouter's current free pool.
- VSIX/output secret scan confirms no API keys are bundled or published.

## [3.15.3] — 2026-06-08

### Changed
- **Provider catalog refresh and production routing policy** — verified Azure GPT-5.5, Groq and OpenRouter live smoke tests; added current OpenRouter free worker models and refreshed capability rankings so Boss Orchestrator can prefer free/cheap workers reliably.
- **Azure GPT-5-family smoke compatibility** — provider diagnostics now use `max_completion_tokens` for GPT-5-family deployments, matching production request handling.

### Verified
- Azure GPT-5.5 live CLI smoke test passed through the configured `qubitpage-resource` deployment without printing keys.
- Groq and OpenRouter live provider smoke tests passed with redacted reports.

## [3.15.2] — 2026-06-08

### Added
- **Visible cost labels in the model selector** — provider groups now show cost categories and the compact model dropdown appends context plus `FREE`, `FREE TIER`, `LOCAL`, `AZURE CREDITS`, `SUBSCRIPTION`, or `PAID` so users can choose credit-saving models intentionally.
- **Credit-saving routing documentation** — clarifies that Boss Orchestrator/delegate workers prefer free/local/free-tier models first, then Azure credits/subscription models, and reserve paid/premium models for final review.

### Verified
- Sub-agent fallback smoke test confirms inaccessible/free worker models are skipped and a working cheap/free worker is selected.

## [3.15.1] — 2026-06-08

### Fixed
- **Persistent terminal timeout recovery** — timed-out commands now kill/reset the shell so stale output cannot leak into the next command. Commands that intentionally exit the shell resolve with the real exit code instead of waiting for timeout.
- **Azure/Grok streaming resilience** — retries transient network/socket failures (`ECONNRESET`, `ETIMEDOUT`, `socket hang up`, DNS retry errors) before failing with a readable provider error.
- **Sub-agent worker fallback** — worker calls cap output tokens for provider ceilings and skip inaccessible/free models (`model_not_found`, 404/no-access, quota/rate/timeout) before trying the next capable worker.
- **Approval-mode semantics clarified** — `default` keeps manual approvals and manual Continue, `bypass` auto-approves safe/moderate actions but keeps Continue manual, and `autopilot` auto-approves all tools and auto-continues through step ceilings.

### Changed
- **Azure GPT-5.5 context metadata** updated to **656K**.
- **Azure Grok 4.3 context metadata** updated to **322K**.
- Marketplace README/description now describe the reliability fixes and updated Azure context windows.

## [3.15.0] — 2026-06-03

### Added
- **One-click Continue** — when an agent run reaches its step ceiling (the safety limit that stops runaway tool loops), a **Continue** button now appears under the chat. Press it (or type "continue") to **resume exactly where the run left off**, like GitHub Copilot Chat. Both agent loops emit the resume signal, so nothing is lost when the ceiling is hit.

### Changed
- **Redesigned activity-bar icon** — replaced the old silhouette (which rendered as a flat square at small sizes) with a **clean Sentinel helmet** using a cut-out eye-slit and vent so it stays crisp in the activity bar.

## [3.14.2] — 2026-06-03

### Fixed
- **Answers no longer stop mid-response** — the **Max Tokens (per response)** setting is now **model-aware**. The output budget is synced to the model actually being used, so a small global cap (e.g. a legacy 2048) can no longer truncate a long GPT-5.5 answer.

### Changed
- **Max Tokens default is now `0` = Auto** — uses the selected model's full output limit (GPT-5.5 up to 128K) so long answers run to completion. A non-zero value still caps output but is **never allowed to exceed the model's real limit**.
- **Settings panel shows the live model limits** — the Max Tokens field now displays the selected model's real output-token and context-window capacity, kept in sync with the API catalog.
- **One-time migration** — existing installs with a legacy small cap (≤ 8192) are automatically moved to Auto so users stop getting cut off.

## [3.14.1] — 2026-06-03

### Changed
- **Marketplace listing refresh** — public README/overview and description updated to document the 3.14.0 chat-persistence and fluid-continuation fixes (no code changes).

## [3.14.0] — 2026-06-03

### Fixed
- **Chat output no longer disappears, and switching chats never cancels the one that's running** — this was the big reliability bug. Previously a turn's answer was only written to history when the turn *finished*, and switching chats swapped the history for a **copy**, so a turn that completed after you switched pushed its answer onto the wrong chat and the original lost it; streaming chunks also bled into whichever chat was now on screen. Now:
  - Every turn is **bound to its own chat**. A turn keeps streaming and saving into *its* conversation even after you open or switch to another chat — nothing is cancelled and nothing is misrouted.
  - The assistant message is **persisted incrementally as it streams** (debounced), so partial output survives switching chats, reloading the window, or a crash — like GitHub Copilot Chat.
  - The visible conversation and the stored session are now **one shared array**, so every message is saved the moment it appears.
  - Verified end-to-end against live Azure GPT-5.5 with an automated suite (single-turn persist, mid-stream chat switch with no loss/no bleed, reload restore, multi-turn context recall, and an agent tool-loop mid-stream switch) — 16/16 passing.

### Changed
- **Model-aware context window** — long conversations now use the **selected model's real context window** before any summarisation kicks in (e.g. GPT-5.5 keeps the whole conversation in context instead of being throttled to a small fixed budget), giving fluid multi-turn continuation. The configured budget still acts as a floor for smaller models.
- **Azure GPT-5.5 context raised to 656K** and its deployment throughput increased to remove the 429 rate-limit errors during longer sessions; both streaming paths already retry transient 429/5xx with honored `retry-after`.

## [3.13.2] — 2026-06-02

### Fixed
- **Clicking a chat in History no longer blanks the conversation** — when you opened the History panel and clicked the chat you were already in, the webview cleared the view but the provider returned early (because the session id matched) and never re-rendered, leaving an empty chat. Selecting the current session now re-renders it from memory, so the messages stay put. Switching to a different chat continues to load that chat's full history as before. Sessions are still committed to persistent storage after every turn, so nothing is lost across reloads or restarts.

## [3.13.1] — 2026-06-02

### Fixed
- **Plan / Todo panel disappearing** — the previous release re-restored the chat (and cleared the plan) every time the panel regained focus, which wiped the live Plan/Todo bar. Since the webview now retains its context when hidden, that destructive re-restore was removed; the plan stays visible while you work and is re-shown after a real reload.
- **Multi-agent now actually uses cheaper models** — `delegateTeam` / `delegateSubAgent` workers are forced to the **cheapest capable model** by default, and a new **cost guard** downgrades any premium/frontier model a boss names for a routine draft/build worker (e.g. it will no longer spawn copies of GPT-5.5 as workers). The primary model still synthesises and finalises the result, so quality is preserved while credits are saved.

## [3.13.0] — 2026-06-02

### Fixed
- **Atlas Voice Bridge no longer crashes on EADDRINUSE** — when the bridge port (`37777`) is already in use (e.g. a second VS Code window or a stale listener), the bridge now silently retries the next few ports and, if all are busy, disables itself quietly in that window instead of spamming a warning popup on every reload.
- **Chat history now persists across panel hide/refresh** — the webview is registered with `retainContextWhenHidden`, and the open session (rendered messages **and** model context) is restored when the panel becomes visible again, so leaving and returning keeps your conversation and the model working — like GitHub Copilot Chat.
- **Skills CRUD is fully wired** — the settings → Skills pane now correctly shows the built-in/default skills and supports full create / edit / toggle / delete / import-from-workspace. The provider was missing the `getSkills`/`saveSkill`/`toggleSkill`/`deleteSkill`/`importSkills` message handlers; they are now connected end-to-end.
- **Zero TypeScript diagnostics** — added an explicit `types: ["node", "vscode"]` to `tsconfig.json` so the editor language service resolves Node globals (`fs`, `path`, `Buffer`, `process`, `require`, `setTimeout`, `AbortController`) the same way the compiler does — no more phantom red squiggles.

### Added
- **Minimisable Plan panel** — the live Plan/Todo panel above the chat now has a click-to-collapse header (▾/▸) so you can fold it away when you want more room for the conversation.

## [3.12.0] — 2026-06-02

### Added
- **Per-turn cost & usage telemetry** — every agent turn now appends a compact footer showing **estimated input/output tokens, tool-call count, step count and wall-clock time** (and `~$cost` when the provider exposes per-token pricing). Also logged to the output channel for auditing.
- **Per-provider balance & usage (real API)** — each configured provider gets a **Balance** button that queries the provider's **live balance API** where one exists (**OpenRouter** `/api/v1/credits`, **DeepSeek** `/user/balance`) and shows credit remaining/used. For providers without a balance API it says so honestly and instead surfaces your **real session usage** (requests + estimated tokens in/out) tracked locally. No fabricated numbers.
- **OS / shell awareness** — the agent's system prompt now states the real operating system, the correct shell syntax (PowerShell `;` vs POSIX `&&`), and the current date, so generated terminal commands run correctly on your machine.
- **Two new built-in skills** — *Agentic Workflow (Plan → Act → Verify)* and *Test-Driven & Self-Verifying Changes*, bringing the default skill pack to **8** (and existing installs auto-resync them).
- **QA consumption monitor** — `scripts/perf/qaMonitor.mjs` drives a real 3-file app build through live tool-calling and reports per-model token consumption, latency and cost to pick the best production configuration.

### Fixed
- **Rate-limit & gateway resilience** — streaming requests now **automatically retry transient 429 / 500 / 502 / 503 / 529** responses up to twice with backoff that honours the `Retry-After` header, and surface clearer, actionable messages for rate-limit and auth failures.
- **Malformed tool arguments recover** — when a model emits invalid JSON for a tool call, the parse error is now fed back so it re-issues the call correctly, instead of silently running the tool with empty arguments.
- **MCP errors propagate** — MCP tool results flagged `isError` are now raised as real failures so the agent retries/adapts instead of mistaking the error text for a successful result.
- **Repeat-call loop-guard** — identical tool calls repeated 3× in one turn are short-circuited with a nudge, preventing stuck loops that burn iterations and provider cost.
- **CRLF-tolerant edits** — `editFile` now normalizes line endings to the file's dominant style before matching, so edits apply on Windows CRLF files when the model emits LF.
- **Recoverable deletes** — `deleteFile` routes through the OS trash (recoverable) instead of a permanent unlink.
- **General settings now load real values** — the General tab reflects your saved temperature, max tokens, Ollama URL and the new editable **context budget**, instead of showing hardcoded defaults.
- **Built-in skills now display** — the Skills tab requests its data on open and on tab-switch, so the bundled skill packs render as examples (previously the list could stay empty).

## [3.11.0] — 2026-06-02

### Added
- **Parallel read-only tools** — when the agent asks for several independent, side-effect-free tools in one step (e.g. read 3 files + search the codebase), they now run **in parallel** instead of one-after-another, cutting latency on multi-file investigation. Results are still reported in order, and only auto-approved read-only tools are prefetched.

### Fixed
- **Auto-verify now catches real errors** — the post-edit diagnostics check opens each edited document and waits for the language server to re-analyze before reading errors, so freshly introduced compile/lint errors are actually detected and fed back for self-fix (previously it could read stale/empty diagnostics and miss them).

## [3.10.2] — 2026-06-02

### Changed
- **New activity-bar icon** — replaced the plain square with a proper monochrome **Iron Man–style helmet** silhouette (two angular eye slits + faceplate) that themes correctly in the VS Code activity bar.
## [3.10.2] — 2026-06-02

### Changed
- **Refined Activity Bar icon** — the sidebar helmet now has the signature **twin angular eye slits and faceplate/chin** so it reads unmistakably as an Iron Man–style helmet (the previous version showed a single slit that looked like a generic robot head). Still fully monochrome and theme-aware.

## [3.10.1] — 2026-06-02

### Changed
- **New Activity Bar icon** — the VS Code sidebar icon is now a proper monochrome **Iron Man–style helmet / robot head** silhouette that themes correctly with your color scheme, replacing the old filled square. The marketplace logo is unchanged.

## [3.10.0] — 2026-06-02

### Added
- **Persistent terminal** — `runCommand` now runs in one long-lived shell that keeps your working directory, environment, and activated virtualenv across calls, with a 10-minute default timeout (configurable) so installs, builds and test suites finish instead of being cut off at 30 seconds. Cross-platform (PowerShell on Windows, your `$SHELL` elsewhere).
- **Safe, undoable edits** — `editFile` now requires the exact text to change and refuses ambiguous matches, then applies the change as a normal VS Code edit so it shows in the diff view and can be undone with Ctrl+Z. No more silent first-occurrence corruption.
- **Codebase search** — a new `codebaseSearch` tool does natural-language "where is X / how does Y work" relevance ranking across the repo (filename, term frequency, and definition-line scoring), so the agent finds the right files without burning tool calls.
- **Live plan tracking** — the agent maintains a visible step-by-step plan (via the new `updatePlan` tool) shown in a panel above the chat, so you can follow long enterprise builds and see what's done, in-progress, and pending.
- **Auto-verify before done** — after editing code, the host automatically runs VS Code diagnostics on the touched files and feeds any compile/lint errors back to the agent so it fixes them before declaring the task complete.
- **Checkpoints & revert** — every file a turn changes is snapshotted first; the new context-budget manager and revert path let you roll the agent's changes back.
- **Context-window manager** — long sessions are kept under a configurable token budget (`sentinelCoder.contextBudgetTokens`, default 96K): older turns are automatically summarized instead of overflowing the model or ballooning cost.

### Changed
- **Cross-platform search** — `searchText` no longer depends on Windows `findstr`; it works on macOS/Linux and skips binaries and `node_modules`/build output.
- **Bigger tool-output budgets** — file reads and command output keep more content so build errors aren't truncated away.
- **Workers get codebase context** — Boss-mode worker models now receive the same project grounding as the boss, so delegated work matches your real stack instead of generic boilerplate.

## [3.9.1] — 2026-06-02

### Changed
- **Marketplace listing refreshed** — the overview (README) and extension description now document the 3.8–3.9 features: credit-saving **Boss Orchestrator** mode, **default Skills**, Azure **GPT‑5.5**, frontier-models-on-top ordering, and automatic codebase context. No code changes.

## [3.9.0] — 2026-06-02

### Added
- **Default Skills, loaded every session** — the Settings → Skills tab now ships with six built-in, stack-focused skill packs that are enabled by default and injected into the system prompt on every chat: *Cost-Saving Boss Orchestrator*, *Azure-First Multi-Provider*, *Next.js + Headless Commerce Stack*, *Workspace & Terminal Conventions*, *Deploy & Verification Discipline*, and *VS Code Extension Authoring*. They are generic and contain no secrets, IPs, or credentials. Each can be toggled, edited, or deleted, and re-syncs automatically when updated.
- **Working Skills management UI** — the Skills tab is now fully interactive: create, import from workspace (SKILL.md / *.instructions.md / AGENTS.md), edit, enable/disable, and delete skill packs. Enabled skills become authoritative project knowledge for the agent.

## [3.8.0] — 2026-06-02

### Added
- **Azure AI Foundry GPT-5.5 frontier model** — added `gpt-5.5` (frontier reasoning, 272K ctx, native tools + vision) at the top of the Azure provider, served from the `qubitpage-resource` Foundry deployment. Verified end-to-end: streams text and emits native tool calls.
- **Frontier-models-on-top ordering** — the live OpenRouter catalog now ranks the newest frontier models (GPT-5.5/5.4, Claude Opus 4.x, Grok-4.x, Gemini 2.5/3, Kimi K2, DeepSeek V3/R1) to the top instead of plain alphabetical, matching the marketplace description.
- **Automatic codebase context** — in Agent mode the system prompt now includes a bounded, auto-detected repo map (project type/frameworks, top-level tree, active file + selection, open tabs) so the agent is grounded in the workspace without spending tool calls to discover layout.

### Fixed
- **Reasoning-model API parameters** — OpenAI/Azure reasoning models (o-series, GPT-5.x, Codex, GPT-5-chat) were sent `max_tokens` + a custom `temperature`, which Azure now rejects (HTTP 400). These models now correctly use `max_completion_tokens` and omit `temperature`. Fixes GPT-5.5, GPT Chat (latest), and the existing OpenAI o3/o4/codex entries.
- **Azure API version** — default Foundry `api-version` bumped from `2024-10-21` to `2024-12-01-preview` so GPT-5.x deployments resolve correctly.

### Changed
- **Longer autonomous runs** — agent tool-step ceiling raised from 15 to 30 per turn for Composer-style persistence on multi-step tasks.

## [3.7.0] — 2026-06-01

### Added
- **Full OpenRouter live catalog** — enabling the OpenRouter provider now fetches its entire model list (340+ verified live) from `GET /api/v1/models` instead of a small static set. Includes Claude Opus 4.5 / Sonnet 4.5, GPT-5 / GPT-5-Codex, Gemini, Grok 4.3, Llama, Qwen, DeepSeek and everything else, with `supportsTools` / `supportsThinking` / `supportsVision` and per-model pricing auto-derived from the API. Falls back to the curated static list if offline.
- **Agent-requested approval modes** — new `requestApprovalMode` tool lets the agent ask permission to switch between **Standard** (confirm every action), **Bypass** (auto-approve safe actions) and **Autopilot** (auto-approve everything). The user always sees an approval card and must allow the change before it applies; the toolbar updates live via `approvalModeChanged`.
- **Collapsible tool cards** — every tool run renders as a minimized card (collapsed by default, GitHub Copilot style) with an expand/collapse chevron. Live "Running" cards animate, then resolve to Done/Failed, and long output no longer floods the chat.
- **New brand icon** — sleek sentinel guardian head with a glowing `</>` core (Azure GPT-Image-2 generated).

### Fixed
- **Chat message ordering** — the agent's final answer now appears at the **bottom** as the last message. After a tool run, the next prose opens a fresh assistant bubble *below* the tool cards (`newResponseBlock`) instead of overwriting the bubble above them, which previously made output appear "at the top".

### Changed / Optimized
- Native agent loop now streams only the current iteration's prose per block instead of re-pushing the entire accumulated transcript on every chunk — lighter DOM updates and correct interleaving of text and tool cards.
- Tool cards are queued on `toolStart` and matched to their `toolResult` in order, so each result fills its own card.

## [3.6.0] — 2026-06-01

### Added
- **Parallel multi-agent collaboration** — new `delegateTeam` tool fans out up to 5 independent sub-tasks across different models simultaneously (e.g. research + scaffold + tests at once), then synthesizes the results. Verified live: 3 Azure models ran concurrently (wall time < sum of individual times).
- **Working sub-agent hand-off** — `delegateSubAgent` now returns the specialist model's real result back into the main agent's context (previously the result was discarded).
- **Chain-of-thought + full-context prompting** — the agent outlines a short plan, executes step by step, verifies each tool result, and explicitly relates each step to earlier messages/files/tool results for coherent end-to-end work on complex tasks.

### Notes
- Delegation tools are exposed as native function calls and only appear when 2+ models are configured.
- Entire conversation context is retained (no truncation) so multi-step tasks stay coherent.

## [3.5.0] — 2026-06-01

### Fixed
- **Agent mode now reliably executes tools.** Frontier models (Grok-4.3, GPT-4.1, Kimi, etc.) emit structured tool calls instead of a brittle text protocol, so the agent actually creates files, runs commands, serves pages, and SSHes — no more stalling after "I'll build it for you…".

### Added
- **Native OpenAI function/tool calling** for all OpenAI-compatible providers (Azure, Groq, OpenRouter, DeepSeek, Mistral, Together, Vultr, HuggingFace, Moonshot/Kimi, custom). Multi-tool calls per turn, tool results fed back automatically, iterates until the task is complete.
- **Native Copilot Chat model provider** — pick Grok-4.3 and every other configured model from VS Code's built-in chat model picker.
- Live tool-activity events (`toolStart`/`toolResult`) streamed to the chat UI.

### Notes
- Ollama/local models keep the text tool protocol as a fallback.
- Paste any provider key in Settings → it is stored encrypted (SecretStorage) and persists across restarts. No other local setup required.

## [3.0.0] — 2026-04-06

### Added
- **12 AI providers**: Ollama, OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, DeepSeek, Mistral, Together AI, Vultr, HuggingFace, and custom OpenAI-compatible endpoints
- **50+ models** with rich metadata (pricing, context window, feature support)
- **Auto Model Router** — automatically selects the best model for coding, reasoning, speed, or agentic tasks
- **Sub-Agent delegation** — spawn sub-tasks on specialized models
- **Thinking display** — collapsible panel showing reasoning process for thinking models (o3, DeepSeek R1, Qwen3)
- **Agent mode** with 18 built-in tools (files, editor, terminal, web, analysis)
- **Ask mode** for direct Q&A and code generation
- **Plan mode** for analysis without execution
- **Secure API key storage** via VS Code SecretStorage (OS-level encryption)
- **CoderQ personality** with welcome messages and contextual humor
- **Chat Participant** (`@sentinel`) for VS Code's native chat panel

### Security
- API keys stored in encrypted SecretStorage, never in plaintext settings.json
- No telemetry or data collection
- Removed all hardcoded paths from source

## [2.0.0] — 2026-03-15

### Added
- Ollama integration with streaming responses
- Sidebar chat interface with markdown rendering
- File and terminal tools for agent mode
- Basic model selection

## [1.0.0] — 2026-03-01

### Added
- Initial release with Ollama-only support
- Chat sidebar
- Basic code generation
