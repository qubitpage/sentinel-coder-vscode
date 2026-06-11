# Changelog

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
