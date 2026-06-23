## Version 3.16.55 - Stability recovery for autopilot and chat output

This release restores the known-good Sentinel Coder One Studio chat/autopilot runtime from the stable 3.16.10 baseline after regressions in later builds caused mid-task stopping, raw command/code output to appear in the wrong place, and unreliable autopilot continuation.

- Restored stable chat renderer and collapsed tool-result behavior.
- Restored stable autopilot/continue controls.
- Restored predictable output ordering: final assistant text is rendered below tool cards.
- Kept Foundry IQ proof/report assets in the repo, but removed risky Foundry IQ UI changes from the live chat path until they can be reintroduced behind stronger UI tests.
- Goal: predictable autonomous task execution first.

﻿## Version 3.16.54 - GitHub proof assets for Foundry IQ comparison

Sentinel Coder One Studio now includes the Foundry IQ comparison proof assets directly in the GitHub/Marketplace package so the evidence links resolve for users. The concise comparison remains: no-IQ answer 67/100 vs Foundry-IQ grounded answer 100/100, with 9 live sources retrieved from the real Knowledge Base.

| Proof item | Result |
| --- | --- |
| Microsoft IQ layer | Foundry IQ |
| Runtime path | Azure AI Search Knowledge Base retrieve |
| Knowledge Base | `sentinel-coder-iq-kb` on `qubitpage-srch` |
| Sources retrieved | `9` |
| No-IQ answer score | `67 / 100` |
| Foundry-IQ answer score | `100 / 100` |
| Evidence | `docs/foundry-iq/FOUNDRY_IQ_VS_NO_FOUNDRY_INFOGRAPHIC.html` |

**Benefit:** without Foundry IQ, the agent gives a generic implementation plan. With Foundry IQ, Sentinel Coder grounds the answer in current Sentinel Coder One release/docs evidence, reports retrieved sources, and avoids inventing product-specific facts.

## Version 3.16.52 - Secure Foundry IQ runtime

The Microsoft IQ runtime no longer spawns Azure CLI or shell commands from the VS Code extension. Foundry IQ Knowledge Base retrieve endpoints now require a bearer/JWT token supplied through `sentinelCoder.microsoftIq.apiKeyEnv` (default `MICROSOFT_IQ_BEARER_TOKEN`). Azure CLI is used only by local provisioning/test scripts, not by Marketplace runtime code.

## Version 3.16.51 - Real Foundry IQ Knowledge Base Retrieve Runtime

Sentinel Coder One Studio now defaults to the verified Microsoft Foundry IQ Knowledge Base retrieve endpoint on `qubitpage-srch`: `sentinel-coder-iq-kb`. The runtime supports the documented `2026-04-01` retrieve schema with `intents` and `knowledgeSourceParams`, and can obtain Azure Search bearer tokens via Azure CLI for local desktop testing without storing tokens in source.

<div align="center">

# Sentinel Coder One Studio

## 3.16.50 - Verified Microsoft Foundry IQ setup, real Azure Search grounding, and inline Settings fix

Sentinel Coder One Studio now integrates the required Microsoft IQ layer for the Microsoft Agents League Hackathon through **Foundry IQ backed by Azure AI Search**.

- **Real Foundry IQ backend:** `sentinel-coder-iq` index on Azure AI Search service `stan` in resource group `foundryIQsource`.
- **Real grounding in prompts:** when enabled, Sentinel queries Foundry IQ before model calls and injects retrieved enterprise/project context into the agent prompt.
- **Visible setup path:** Foundry IQ appears in the real inline sidebar UI and Settings overlay with Enable, layer, endpoint, API env var, timeout, max-query, Save, and Test controls.
- **Verified endpoint:** extension-module smoke test returns Foundry IQ context from the Azure Search index using `MICROSOFT_IQ_BEARER_TOKEN` without printing secrets.
- **Chat visibility fixes:** latest assistant output, restored sessions, and Foundry IQ test results are pinned to visible chat output while preserving manual scroll behavior.

### Hackathon Microsoft IQ requirement

This submission explicitly uses **Microsoft IQ / Foundry IQ**:

| Requirement | Sentinel Coder One implementation |
| --- | --- |
| IQ layer | Foundry IQ |
| Backend | Azure AI Search index `sentinel-coder-iq` |
| Endpoint setting | `sentinelCoder.microsoftIq.endpoint` |
| Secret handling | Bearer/JWT token read from `MICROSOFT_IQ_BEARER_TOKEN`; never hardcoded |
| Agent behavior | Retrieves project/enterprise knowledge and injects it into coding-agent prompts |
| UI behavior | Foundry IQ setup and test controls are visible in Sentinel Coder One Studio |

### Autonomous AI coding + Agentic Profiles + Media & Document Studio for Visual Studio Code

**Multi-provider chat | Categorized live model selector | Single-model full-capability mode | Opt-in Agentic orchestration | Microsoft Foundry IQ grounding | Azure/OpenAI/Anthropic/Groq/OpenRouter/Ollama and OpenAI-compatible providers | Sora video | Image/audio/document Studio | VS Code Web + Remote Tool Bridge**

Built by [QubitPage Research](https://github.com/qubitpage) | MIT licensed

[GitHub repository](https://github.com/qubitpage/sentinel-coder-vscode) | [Contributing guide](https://github.com/qubitpage/sentinel-coder-vscode/blob/main/CONTRIBUTING.md) | [Issues and feature requests](https://github.com/qubitpage/sentinel-coder-vscode/issues)

</div>

---

## Recent verified releases

### 3.16.50 - Inline Microsoft IQ settings pane fix

- Fixed the real rendered Sentinel Settings overlay: Microsoft IQ / Foundry IQ opens a real inline `settings-iq` pane instead of a blank Settings page.
- Added visible Enable, layer, endpoint, API env var, timeout, max-query, Save, and Test controls to the actual inline webview HTML in `src/sidebarProvider.ts`.
- Verified Azure AI Search-backed Foundry IQ through `MICROSOFT_IQ_BEARER_TOKEN`.

### 3.16.49 - Safe inline Foundry IQ banner layout

- Fixed the real inline chat webview layout after Foundry IQ visibility work.
- Kept a full-width Foundry IQ banner below the toolbar so it cannot cover or break the chat header/output area.

### 3.16.48 - Inline Foundry IQ banner in the real chat view

- Fixed the actual rendered webview path: Foundry IQ appears in inline `src/sidebarProvider.ts` HTML, not only in unused `media/sidebar.html`.
- Added an always-visible Microsoft Foundry IQ banner directly below the top toolbar with Setup and Test buttons.

### 3.16.45 - Verified real Azure Foundry IQ Marketplace release

- Configured real Azure AI Search endpoint for Foundry IQ retrieval.
- Verified extension-module smoke test with real endpoint and non-secret API-key environment variable.

### 3.16.44 - Real Azure Foundry IQ connected

- Microsoft IQ / Foundry IQ uses the real Azure AI Search-backed `sentinel-coder-iq` index by default.
- Azure AI Search Foundry IQ Knowledge Base retrieve endpoints are called with bearer/JWT authentication from `MICROSOFT_IQ_BEARER_TOKEN`.

---

## Settings

Important Foundry IQ settings:

| Setting | Purpose |
| --- | --- |
| `sentinelCoder.microsoftIq.enabled` | Enables Microsoft IQ grounding. |
| `sentinelCoder.microsoftIq.layer` | Use `foundry-iq` for this hackathon submission. |
| `sentinelCoder.microsoftIq.endpoint` | Azure AI Search Foundry IQ endpoint. |
| `sentinelCoder.microsoftIq.apiKeyEnv` | Environment variable name containing the bearer/JWT token, normally `MICROSOFT_IQ_BEARER_TOKEN`. |
| `sentinelCoder.microsoftIq.timeoutMs` | Request timeout. |
| `sentinelCoder.microsoftIq.maxQueryChars` | Max query size sent to Foundry IQ. |

Other settings are available in VS Code Settings under **Sentinel Coder One Studio**.

## Security and privacy

- Sentinel is bring-your-own-key.
- API keys are read from environment variables or VS Code SecretStorage/user settings where applicable.
- Foundry IQ credentials are not hardcoded into source or Marketplace artifacts.
- Tool results are summarized/collapsed in the UI to avoid flooding chat with raw command output.


