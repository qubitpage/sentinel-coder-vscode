# Sentinel Coder One Studio 3.16.14: One VS Code AI Studio for Live Models, Agentic Profiles, Media, Remote Tools, and Web

![Sentinel Coder One Studio provider orchestration hero](assets/sentinel-coder-3-16-14-marketplace-hero.png)

Sentinel Coder One Studio is built for a fast-moving AI world where the best model this week may not be the best model next month. Instead of forcing one vendor, one static model list, or one orchestration style, Sentinel gives VS Code users a provider-neutral AI studio with live model discovery, single-model full-capability mode, optional Agentic Profiles, dynamic context, tool execution, media generation, and VS Code Web support.

## The core idea

Use the right model pattern for the job:

- **Single model mode** for maximum capability from the model you selected. If you choose a strong Azure, OpenAI, Claude, Grok, Gemini, Groq, OpenRouter, or local model, Sentinel lets that model work directly with its detected context/output/tool capability.
- **Agentic Profile mode** only when you explicitly choose an `Agentic:` profile. Profiles define a main orchestrator, worker agents, reviewers, cost policy, parallelism, and fallback strategy.
- **Live provider catalogs first**. When providers expose model APIs, Sentinel refreshes the dropdown from the provider instead of relying only on hardcoded fallback models.
- **Cost-aware orchestration**. Free/local/cheap models can draft, inspect, summarize, or brainstorm; stronger models can verify, review, and finalize.
- **Real verification**. Sentinel is designed to run diagnostics, tests, builds, scans, package checks, and browser/HTTP verification rather than only writing prose.

## What is new in 3.16.14

- **Resilient Agentic worker fallback**: if a free/cheap worker is rate-limited, throttled, overloaded, temporarily unavailable, or returns a provider 429/5xx-style error, Sentinel cools that model down, tries another configured worker/reviewer where possible, and continues with a warning instead of collapsing the whole turn.
- **Marketplace article and presentation asset**: this article and the generated provider-orchestration hero image are included in the public documentation and Marketplace package.
- **Clearer provider/model positioning**: docs now explain live model discovery, paid vs free/free-tier labeling, OpenRouter access to rapidly changing Claude/Fable/Opus-style model IDs, and how to use Agentic Profiles safely.

## Provider families supported

Sentinel can work with configured providers such as:

| Provider family | Typical use | Discovery behavior |
| --- | --- | --- |
| **Azure OpenAI / Azure AI Foundry** | Enterprise deployments, Azure credits, GPT/Grok/model-router deployments, image/audio/video deployments where configured | Deployment/model APIs when configured; curated fallback only when live discovery is unavailable |
| **OpenAI-compatible** | OpenAI, private gateways, Mistral-compatible, Together-compatible, custom routers | `/models` when supported |
| **OpenRouter** | Multi-vendor paid and free/free-tier model catalog | Live catalog with context, pricing, supported parameters, and capability metadata where exposed |
| **Groq** | Fast OSS inference and low-latency fan-out | Live model list where supported plus fallback presets |
| **Anthropic** | Claude coding, review, and reasoning workflows | Direct Anthropic configuration where available; OpenRouter can also expose Anthropic-family models |
| **Google/Gemini** | Research, summarization, multimodal, cost-effective planning | Direct/OpenAI-compatible/OpenRouter routes depending on user setup |
| **Mistral** | European/open model workflows and coding assistants | Direct/OpenAI-compatible routes depending on setup |
| **DeepSeek** | Cost-effective coding/reasoning models | Direct/OpenAI-compatible/OpenRouter routes depending on setup |
| **Together / Vultr / HuggingFace / Featherless / Moonshot-Kimi** | OSS model access, experiments, vendor-specific inference | Live `/models` where available |
| **Ollama / local models** | Privacy-first local coding, offline drafts, zero cloud spend | Local catalog from the Ollama endpoint |

Sentinel does not require every provider. Configure the providers you use, bring your own keys, and choose models from the live dropdown.

## OpenRouter and latest Claude/Fable/Opus-style models

OpenRouter is especially useful because it can expose many vendor families behind one API key. In a live OpenRouter catalog snapshot checked for this release, Sentinel observed examples such as:

| Example OpenRouter model ID | Notes |
| --- | --- |
| `~anthropic/claude-fable-latest` | Dynamic alias to the latest Claude Fable family model; live catalog showed 1M context and 128K max completion metadata. |
| `anthropic/claude-fable-5` | Claude Fable 5 family entry; live catalog showed text/image/file input to text output, reasoning/tool parameters, 1M context metadata. |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | Free OpenRouter entry observed with large-context metadata; useful for free-only experimentation where available. |
| `nex-agi/nex-n2-pro:free` | Free multimodal-capable entry observed in the live catalog snapshot. |
| `nvidia/nemotron-3.5-content-safety:free` | Free guardrail/safety-oriented model observed in the live catalog snapshot. |

Important: OpenRouter IDs, pricing, rate limits, context windows, and availability can change. Sentinel’s strategy is therefore to use **live discovery** and fallback metadata, not to promise that a static list is complete forever.

### How to use latest Claude/Fable/Opus-style models through OpenRouter

1. Add an OpenRouter API key in Sentinel provider settings.
2. Refresh provider models.
3. Open the chat model selector.
4. Look under the OpenRouter provider group.
5. Choose the exact live-discovered model ID, such as a Claude/Fable/Opus/Sonnet/Haiku entry if it is present in your catalog and enabled for your account.
6. For single-model work, choose the model directly.
7. For orchestration, create or edit an Agentic Profile and add that model as:
   - main orchestrator for high-quality direct work,
   - reviewer for hard critique/security/architecture,
   - or worker only if cost and rate limits make sense.

## Paid and free/free-tier model strategy

Sentinel categorizes models by provider and price hints where metadata exists:

- **Local**: Ollama/local models; no provider token cost, but uses local compute.
- **Free**: catalog price is zero or model ID indicates `:free`.
- **Free-tier**: provider may offer free allowance/rate limits but can still require an account/key.
- **Subscription/Azure credits**: enterprise deployments billed through Azure or subscription arrangements.
- **Paid / pay-per-use**: normal token billing.
- **Unknown price**: provider did not expose reliable pricing metadata; verify before high-volume usage.

Recommended pattern:

- Use **single premium model** when quality and coherence matter more than token cost.
- Use **free/local workers** for drafts, extraction, alternate plans, summaries, and low-risk brainstorming.
- Use **premium reviewers** only for high-risk code, architecture, security, finance, release gates, and final verification.
- Keep default context budgets conservative even if a model supports 1M tokens; only expand when the task needs it.
- Treat free models as opportunistic: they can be rate-limited, slower, weaker, or temporarily unavailable.

## Agentic Profiles

Agentic Profiles are reusable orchestration recipes. A profile can define:

- main model,
- worker model pool,
- reviewer model pool,
- default worker,
- max parallel agents,
- cost policy,
- whether premium workers are allowed,
- whether cheap/free fallback is allowed,
- profile-specific instructions.

Built-in profile patterns include:

- **Standard: Single Model Full Capability**
- **FREE: Multi-Provider Coding Council**
- **FREE: OpenRouter Coding Swarm**
- **FREE: Groq Fast OSS**
- **FREE: Gemini / Google Free-Tier Research**
- **FREE: Local Ollama Private Lab**
- **Azure Cost-Smart Production**
- **OpenRouter: Free-First + Premium Judge**
- **Claude / Anthropic Deep Review**
- **Groq Fast Fan-Out**
- **Local Private Coding Lab**
- **Multi-Provider Elite Council**

## What Sentinel can do in VS Code Desktop

- Chat in Ask, Plan, and Agent modes.
- Read active files, selections, open tabs, diagnostics, workspace info, and Git state.
- Create, edit, append, and delete files.
- Search files/text and use codebase search.
- Run terminal commands with persistent shell state.
- Run tests/builds/package commands and report real outputs.
- Use Git status/diff/log/commit/push helpers.
- Use Docker CLI operations.
- Use SSH for remote servers.
- Run HTTP requests and web search.
- Use RAG ingest/query for project knowledge.
- Inspect PDFs, Office files, images, audio, and video where local tools are available.
- Generate or manage documents, presentations, reports, and templates.
- Run targeted security/firewall scans for secret leaks, unsafe HTML, injection risks, destructive commands, and debug code.

## What Sentinel can do in VS Code Web / vscode.dev

Browser extensions cannot directly run local terminals, Docker, native SSH, local Ollama, or native MCP tools. Sentinel’s web strategy is to expose as much as possible through:

- VS Code Web-compatible extension entry point,
- browser-safe UI and workspace APIs,
- web-compatible provider calls where permitted by provider/CORS/security settings,
- Remote Tool Bridge configuration for operations that must run on a trusted desktop/server bridge,
- clear status/help commands explaining what is local-only, browser-safe, or bridge-backed.

## Media and document Studio

Sentinel includes a Studio workflow for generated and inspected assets:

- Azure image generation where configured.
- Azure Sora-style video generation where configured.
- Azure speech/audio generation where configured.
- Office document generation for DOCX/XLSX/PPTX.
- File inspection and previews.
- Generated-content organization under `.sentinel/generated`.

## Enterprise-grade safeguards

Sentinel’s release workflow emphasizes:

- TypeScript compile checks.
- Regression tests.
- Web manifest verification.
- VSIX archive hygiene.
- Secret/token scans.
- Webview hardening.
- Operation-aware tool routing.
- Provider/model capability checks.
- Marketplace package verification.

## Bottom line

Sentinel Coder One Studio is not just a chat panel. It is a provider-neutral AI coding studio for people who want:

- direct access to the best model they selected,
- optional multi-agent orchestration when it helps,
- live model discovery instead of stale hardcoded lists,
- free/paid/local model strategies,
- media/document workflows,
- desktop and web compatibility,
- and real build/test/security verification before shipping.

Repository: https://github.com/qubitpage/sentinel-coder-vscode

Marketplace: https://marketplace.visualstudio.com/items?itemName=Qubitpage.sentinel-coder
