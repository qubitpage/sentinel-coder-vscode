# Sentinel Coder Agentic Profile Strategy

This document explains the built-in Agentic Profile presets shipped with Sentinel Coder One Studio 3.16.12 and how they should behave across providers.

## Core rule

Single-model selections are direct. If the user selects a normal model, Sentinel uses that model at its detected context/output capability and does not spawn sub-agents.

Agentic orchestration is opt-in. It starts only when the user selects an `Agentic:` profile.

## Research-backed orchestration patterns

The presets encode proven production workflows:

- **Routing**: classify task risk and assign the cheapest capable model.
- **Prompt chaining**: split large work into inspect -> plan -> edit -> verify steps.
- **Parallelization**: fan out independent research, code reading, or critique tasks.
- **Orchestrator-worker**: main model plans and owns final output; workers draft or gather evidence.
- **Evaluator-optimizer**: reviewer critiques the draft; main model fixes and verifies.
- **Handoffs**: specialized workers handle focused tasks, but control returns to the main model.
- **Adversarial review**: use a different model/provider for security and architecture critique when available.

## Built-in adaptive profiles

Preset model IDs are templates. The profile editor always uses live dropdowns from configured provider catalogs. If a template model is not available, choose the nearest live model with the same role/cost profile.

Free-only profiles are intentionally listed first so users can test orchestration without burning paid tokens. They disable premium workers and instruct the main agent not to escalate to paid models unless the user edits the profile or switches to a paid profile.

| Profile | Role strategy |
| --- | --- |
| Standard: Single Model Full Capability | Direct selected model, no sub-agents. |
| FREE: Multi-Provider Coding Council | Uses only discovered free/free-tier/local models across OpenRouter, Groq, Gemini/free-tier gateways, and Ollama; verifies carefully because free models can be rate-limited or inconsistent. |
| FREE: OpenRouter Coding Swarm | OpenRouter-only `:free` / free-priced Qwen, DeepSeek, Kimi, Gemini-style workers for code reading, tests, docs, and low-risk drafts. |
| FREE: Groq Fast OSS | Fast OSS fan-out for drafts, summaries, tests, and critique; strict verification required before changes are applied. |
| FREE: Gemini / Google Free-Tier Research | Research, summarization, UI copy, and planning with free-tier Gemini/Flash-style models exposed by the configured provider catalog. |
| FREE: Local Ollama Private | Zero cloud spend and privacy-first local-only orchestration with low parallelism to protect CPU/GPU memory. |
| Adaptive: Best Available From Your Keys | Provider-agnostic default that resolves roles from the strongest configured/discovered models. |
| Azure Cost-Smart Production | GPT-4.1/Grok for most tasks; GPT-5.5 only for hard final review, security, architecture, and unresolved disagreement. |
| Azure Frontier Architect | Quality-first Azure council for high-risk architecture and production release gates. |
| OpenAI Balanced Coding | OpenAI planner-worker-reviewer pattern using mini/fast models for drafts and stronger GPT/reasoning models for review. |
| Anthropic Claude Code Quality | Prompt chaining, routing, evaluator-optimizer safety workflow with Sonnet/Haiku/Opus-class roles when configured. |
| OpenRouter Balanced Coding | Mix best live OpenRouter paid/frontier model with free-tier workers; respect live pricing/context metadata. |
| Groq Fast Swarm | Low-latency parallel drafting and critique with OSS models. |
| Local/Private Ollama | Privacy/cost-first local drafting and review with limited parallelism. |
| Multi-Provider Frontier Council | Best model per role across all configured providers; main model synthesizes and verifies rather than voting blindly. |
| Open-Compatible Coding Mix | Mistral, DeepSeek, Together, Vultr, Moonshot/Kimi, Featherless, or custom OpenAI-compatible catalogs through live dropdown replacement. |

## Cost/performance policy

1. Use expensive frontier models only where they add measurable value: final review, architecture, security, financial reasoning, difficult bugs, and unresolved disagreements.
2. Use mid-tier coding models for day-to-day implementation.
3. Use fast/free/local models for retrieval, summarization, boilerplate, test ideas, and broad brainstorming.
4. Keep context targeted. Prefer active file, exact reads, diagnostics, and RAG snippets over dumping the whole workspace/history.
5. Always run real verification: TypeScript compile, tests, packaging, firewall scan, or the relevant project build.

## Provider guidance

- **Azure/OpenAI Foundry**: best when the user has credits, enterprise controls, and deployed model endpoints. Use live deployment/model metadata where available.
- **OpenAI/OpenAI-compatible**: use the Models API/capability metadata where exposed; otherwise use curated fallback labels.
- **Anthropic/Claude**: strong for safe coding, long-form review, and evaluator-optimizer patterns.
- **OpenRouter**: broadest multi-vendor catalog; use live pricing/context metadata and free-tier labels when exposed.
- **Groq**: excellent for low-latency fan-out and cheap evidence gathering; verify outputs carefully.
- **Ollama/local**: privacy and zero API spend; smaller context/performance varies by local hardware.

## Safety rule

Worker output is never final. The main model must inspect it, correct it, apply changes through tools, run verification, and summarize the evidence.
