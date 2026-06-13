
## 3.16.54 - GitHub proof assets for Foundry IQ comparison

- Added the Foundry IQ vs No Foundry IQ infographic, JSON proof, and summary under docs/foundry-iq so README/Marketplace evidence links resolve from GitHub and packaged docs.
- Kept the verified comparison concise: 9 live Foundry IQ sources, no-IQ score 67/100, Foundry-IQ score 100/100.

## 3.16.53 - Verified Foundry IQ comparison

- Added a concise Marketplace overview section proving the Microsoft Foundry IQ benefit with the same coding task run with and without grounding.
- Verified live Foundry IQ Knowledge Base retrieve against Azure AI Search-backed `sentinel-coder-iq-kb` on `qubitpage-srch`.
- Documented the measured comparison: no-IQ `67/100`, Foundry-IQ `100/100`, with `9` sources retrieved.
- Added local evidence artifacts: HTML infographic, PNG infographic, and JSON comparison report under `reports/training/`.

## 3.16.52 - Secure Foundry IQ runtime

- Removed Azure CLI process spawning from bundled Microsoft IQ runtime.
- Foundry IQ Knowledge Base retrieve uses explicit bearer/JWT token environment configuration.
- Keeps Azure AI Search api-key support for `/indexes/.../docs/search` compatibility.

## Version 3.16.51 - Real Foundry IQ Knowledge Base Retrieve Runtime

Sentinel Coder One Studio now defaults to the verified Microsoft Foundry IQ Knowledge Base retrieve endpoint on `qubitpage-srch`: `sentinel-coder-iq-kb`. The runtime supports the documented `2026-04-01` retrieve schema with `intents` and `knowledgeSourceParams`, and can obtain Azure Search bearer tokens via Azure CLI for local desktop testing without storing tokens in source.

## 3.16.50 - Clean Foundry IQ docs and verified Azure Search grounding

- Cleaned Marketplace overview ordering so the latest Microsoft Foundry IQ implementation appears first.
- Rebuilt Foundry IQ documentation sources around the current real implementation: inline Settings pane, Azure AI Search endpoint, and real `MICROSOFT_IQ_API_KEY` smoke verification.
- Prepared the Azure Search `sentinel-coder-iq` index for re-ingestion from current docs and release reports.

## 3.16.50

- Fixed the actual inline Settings overlay so Microsoft IQ / Foundry IQ setup no longer opens a blank pane.
- Added the missing inline `settings-iq` pane and Microsoft IQ tab to `src/sidebarProvider.ts`, matching the existing webview JS handlers.
- Verified Foundry IQ remains backed by the real Azure AI Search index `sentinel-coder-iq`.

## 3.16.49

- Fixed the real inline chat UI layout by removing Foundry IQ controls from the cramped top toolbar.
- Kept Microsoft Foundry IQ visible as a safe full-width inline banner below the toolbar with Setup and Test actions.
- Preserved Azure AI Search-backed Foundry IQ grounding and smoke-test coverage.

## 3.16.48

- Fixed the real rendered sidebar path by adding the Microsoft Foundry IQ banner to inline `src/sidebarProvider.ts` HTML.
- Foundry IQ setup and test controls are now visible directly in the actual chat webview.
- Preserved real Azure AI Search-backed Foundry IQ grounding and smoke-test coverage.

## 3.16.47

- Added an always-visible Microsoft IQ / Foundry IQ banner at the top of the main sidebar.
- Added direct Open Setup and Test Foundry IQ buttons to the banner.
- Published as a clean follow-up for users who could not discover the hidden/settings-only IQ controls.

## 3.16.46 - Top-toolbar Foundry IQ and stable chat scrolling

- Added persistent top-toolbar **Foundry IQ** button and live **IQ: ON/SETUP/ERR** pill.
- Fixed chat scroll handling by ignoring programmatic scroll events while preserving manual scrolling.
- Kept real Azure AI Search-backed Foundry IQ endpoint defaults and test action.


## 3.16.45 - Verified Microsoft Foundry IQ / Azure AI Search integration

- Published Marketplace update after real Azure Search-backed Foundry IQ verification.
- Defaults point to the `sentinel-coder-iq` Azure AI Search index.
- Added clear Marketplace overview notes for Microsoft IQ hackathon compliance.
- Kept secrets out of source; runtime key is loaded from `MICROSOFT_IQ_API_KEY`.

## 3.16.44 - Real Azure Foundry IQ Connected

- Wired Microsoft IQ / Foundry IQ to the real Azure AI Search-backed `sentinel-coder-iq` index.
- Added Azure AI Search request/auth compatibility while preserving generic Foundry-style endpoints.

## 3.16.43

- Made Microsoft IQ / Foundry IQ visible directly in the main sidebar.
- Added main-card setup and test controls.
- Changed activation from startup to view/command activation for faster VS Code load.


## 3.16.41 - Foundry IQ visible and testable in UI

- Microsoft IQ / Foundry IQ is now the first/default Sentinel Settings pane.
- Added Test Foundry IQ action with visible PASS/failure status in the sidebar.
- Strengthened latest-message scroll pinning for restored sessions and completed responses.

ï»¿## 3.16.40 - 2026-06-13

### Added
- Added a visible **Microsoft IQ** settings pane to the real Sentinel Coder One Studio sidebar UI.
- Added UI controls for Microsoft IQ enablement, IQ layer selection, Foundry IQ endpoint, deployment/vector store/knowledge base IDs, and max grounding results.
- Added explicit Marketplace Overview documentation for the hackathon-required Microsoft IQ / Foundry IQ integration.

### Changed
- Bumped the real Marketplace extension package to `3.16.40` so the updated README/Overview is republished.

### Fixed
- Strengthened latest-chat visibility: restored messages, system notes, user messages, assistant messages, and streaming chunks force the latest output into view.

### Verified
- `npx tsc -p ./` passes.
- Foundry IQ mock grounding test passes.
- VSIX package/install/publish flow verified on the real `Qubitpage.sentinel-coder` extension.


# 3.16.37

- Added explicit Microsoft IQ / Foundry IQ grounding integration for hackathon submissions.
- Added settings for Foundry IQ endpoint, layer, token environment variable, timeout, and query size.
- Injects Microsoft IQ grounding into both simple chat and agentic tool-loop prompts.
- Strengthened chat latest-message visibility so new/streamed output stays pinned to the bottom.

ï»¿
## 3.16.35 - Agentic CRUD and MCP click reliability

- Fixed Agentic Profiles settings CRUD when clicking nested text/icons inside Edit, Select, or Delete buttons.
- Hardened MCP server action buttons so Connect/Test/Remove resolve nested click targets reliably.
- Added regression assertions to prevent Agentic CRUD and MCP delegated-click regressions.
# Changelog

## 3.16.22 - Chat Model and Agentic Selector Visibility Fix

- Fixed the post-3.16.10 chat selector regression where the top chat dropdown could collapse to an Auto/no-model state when live provider discovery returned no normal models, even though Agentic profiles and fallback model choices were available.
- The chat model dropdown now always renders Auto routing, Agentic profile modes, most-used choices, and any cached/provider fallback models instead of replacing the selector with a dead "No configured models" option.
- Agentic profile list updates now immediately refresh the chat selector, so built-in and custom Agentic modes appear even when profile data arrives before or after the provider model list.
- Strengthened the model selector regression test to block future releases that remove Auto/Agentic dropdown visibility or reintroduce the no-model placeholder.

## 3.16.21 - Studio Video, Image, File Manager, MCP and RAG Polish

- Expanded Marketplace/GitHub documentation for Studio media generation beyond image-only workflows, including Azure Sora 2 video generation, MP4 playback, sound/volume expectations, storyboard prompts, smoke testing, MAI Image, GPT Image, Azure Speech, Speechmatics transcription, and troubleshooting notes.
- Added Studio file-manager actions for create, duplicate, rename, delete, open, reveal, save, version restore, comments, and AI actions over generated/workspace assets with workspace-bound safety checks.
- Improved Studio video/audio previews with native webview media controls, preload metadata, unmuted/volume-ready playback, and explicit guidance for Sora MP4 audio tracks or separate Azure Speech narration.
- Corrected media capability discovery so Sora 2 is reported as a wired/testable Azure video model while still warning that availability depends on account, region, quota, deployment access, and content policy.
- Hardened local MCP startup on Windows/Desktop by resolving `npx` to `npx.cmd` under `shell:false`, extending first-run startup timeouts for `npx -y` package installs, and improving Node.js/PATH troubleshooting messages for filesystem and memory built-ins.
- Added local fallback RAG memory: when the optional `rag_server.py` vector service is unavailable, `ingestRAG` stores workspace-backed JSONL memory and `queryRAG` searches that fallback instead of returning only a dead server error.

## 3.16.20 - Model Selector Regression Fix

- Fixed the published 3.16.19 chat model selector regression where the picker could show only `Auto` after a live provider model refresh failed, returned an incomplete list, or hit a frontend refresh error.
- Replaced the stale undefined selector helper call in the `modelList` webview handler with the canonical model-value helper.
- Hardened model refresh fallback so provider catalog/metadata failures are provider-local and the UI reuses cached/provider/profile model data instead of collapsing to an Auto-only list.
- Extended regression tests to block undefined selector helpers and Auto-only model replacement before Marketplace packaging.

## 3.16.19 - Marketplace Cache Refresh + Verified Enterprise Docs

- Republishes the verified 3.16.18 ASCII-safe landing page, canonical documentation cleanup, and enterprise release-gate updates under a fresh patch version so Microsoft Marketplace Desktop/Web CDN indexes refresh cleanly.
- Keeps the public GitHub and Marketplace text encoding-safe, with no mojibake-prone separators in the feature headline.
- Preserves all verified runtime features from 3.16.18, 3.16.17, and 3.16.16: multi-session terminal pool, memory guardrails, Remote Workspace command support, resilient Agentic fallback, VS Code Web compatibility, and strict package hygiene.

## 3.16.18 - ASCII-Safe Marketplace Landing + Documentation Cleanup

- Rebuilt the GitHub and Visual Studio Marketplace landing text with ASCII-safe separators so broken middle-dot/mojibake characters no longer appear in the feature headline.
- Consolidated duplicate public documentation files into canonical guides for provider setup, security/release, donation/community, enterprise operations, Agentic strategy, Remote Workspace tools, VS Code Web, whitepaper, and pitch deck.
- Preserves the verified runtime work from 3.16.17 and 3.16.16: multi-session terminal pool, memory guardrails, Remote Workspace command support, resilient Agentic fallback, web package compatibility, and enterprise release gates.

## 3.16.17 - Marketplace Refresh Repack

- Repacked and republished the verified 3.16.16 stability release under a fresh Marketplace version so public Marketplace, VS Code Desktop, and VS Code Web channels can expose the latest build consistently.
- Preserves the 3.16.16 multi-session terminal pool, resource/memory guardrails, Remote Workspace command support, Agentic fallback hardening, and enterprise documentation/security packaging work.

## 3.16.16 - Multi-Session Terminal Pool + Memory Guardrails

- Added named terminal sessions to `runCommand` and `remoteWorkspaceCommand` through an optional `sessionId` parameter, so multiple Sentinel chats/tasks can run builds, tests, logs, dev servers, and remote-server fixes without blocking on one global persistent shell.
- Added a bounded terminal session manager with configurable `sentinelCoder.terminalMaxSessions`, `sentinelCoder.terminalMinFreeMemoryMb`, and `sentinelCoder.terminalIdleCleanupSeconds` settings to reduce OOM risk on local PCs and remote servers.
- Improved busy-session guidance: when one terminal session is occupied, Sentinel tells the model/user to use another `sessionId` for safe parallel work instead of repeatedly retrying the same stuck shell.
- Preserved the VS Code Remote Explorer workflow: remote workspace commands reuse VS Code's authenticated Remote SSH / Dev Container / WSL / Codespaces / Tunnel extension host and do not ask users to paste SSH keys.

## 3.16.15 - VS Code Remote Explorer Server-Control Tool

- Added `remoteWorkspaceCommand`, a dedicated tool for VS Code Remote SSH, Dev Containers, WSL, Codespaces, and Tunnels. It executes approved commands on the current remote workspace extension host and reuses VS Code's authenticated remote session instead of asking users for SSH keys again.
- Updated routing instructions so Sentinel prefers `remoteWorkspaceCommand` when the user is already connected to a server through VS Code Remote Explorer, and uses `sshCommand` only for separate SSH targets outside the active VS Code session.
- Documented the safer server-control workflow for Desktop local tools, VS Code Remote workspace-host tools, pure-browser vscode.dev limitations, and optional HTTPS Remote Tool Bridge.

## 3.16.14 - Multi-Provider Article, Presentation Asset + Resilient Agentic Fallback

- Added a Marketplace-visible multi-provider article covering live provider discovery, paid/free/free-tier model strategy, OpenRouter access to latest Claude/Fable/Opus-style model families, Agentic Profiles, Studio media generation, VS Code Web, remote-tool bridge strategy, and enterprise safeguards.
- Added a generated presentation hero image for the provider-orchestration documentation pack.
- **Resilient Agentic worker fallback**: hardened Agentic orchestration against provider throttling. If a free/cheap worker returns rate-limit, quota, temporary-upstream, or 5xx errors, Sentinel cools that worker down, tries another worker/reviewer, and continues the main turn with a clear warning.

## 3.16.13 - Enterprise Documentation, Webview Hardening + Marketplace Release Pack

- Hardened Chat sidebar and Studio webviews by reducing direct raw HTML assignment for user/workspace data and moving dynamic render paths toward DOM-safe builders or centralized sanitized fragments.
- Added enterprise documentation hub with setup, provider/API-key guidance, model selector strategy, Agentic Profiles, Studio/media workflows, VS Code Web/Remote Tool Bridge guidance, troubleshooting, security, and release checklist.
- Added public whitepaper, pitch deck, hard self-critique/roadmap, donation/support page, generated hero assets, and Office presentation assets for GitHub and Marketplace users.
- Rebuilt desktop and web VSIX packages with archive hygiene checks so scripts, tests, source, scratch folders, PowerShell helpers, and inspection artifacts are not shipped in Marketplace packages.

## 3.16.11 - Operation-Aware Native Tools + GPT-5.5 Single-Model Stability

- Added operation-aware native-tool routing so Sentinel does not send unsupported OpenAI-style `tools` / `tool_choice` parameters to provider/model combinations that do not advertise or support that operation.
- Fixed Azure/OpenAI Foundry GPT-5.5 single-model chat failures where provider deployments returned unsupported-operation errors when native tool calling was attempted.
- Preserved native tools for models that do support them and added session learning when a provider rejects native-tool parameters.

## 3.16.10 - Deterministic Agentic Profiles + Live Agent Dropdowns

- Added deterministic Agentic Profile preflight for substantial Agent-mode requests.
- Preserved standard single-model behavior: normal model selections use the selected model directly and do not auto-orchestrate.
- Fixed Agentic Profile settings to use live provider/model dropdowns for main orchestrator, worker agents, and reviewer agents.
- Restored the visible Add follow-up button state while an agent run is active.

## 3.16.9 - Standard Single-Model Mode + VS Code Web Marketplace Packaging

- Added public GitHub community links for Marketplace users.
- Clarified that single-model selections run directly at full detected capability, while Agentic orchestration is opt-in.
- Added web-compatible packaging and verification workflow for vscode.dev / VS Code Web.

## Earlier releases

Earlier 3.14.x and 3.15.x releases introduced persistent chat history, dynamic context budgeting, approval modes, firewall scans, provider catalog refreshes, scroll/focus safety, and Marketplace documentation refreshes. Historical details are intentionally summarized here to keep the public changelog clean and encoding-safe.



