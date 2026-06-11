# Sentinel Coder One Studio 3.16.8 Marketplace Landing Notes

Recommended headline: **Agentic AI coding with authoritative live provider model catalogs and Azure cost-smart orchestration.**

## What is new

- Azure Foundry/OpenAI deployment discovery is live and authoritative. If the resource API returns 10 chat-capable deployments, Sentinel shows those 10 in dropdowns.
- OpenAI-compatible providers use live `/models` catalogs when available: Groq, OpenAI, Mistral, DeepSeek, Together, Vultr, HuggingFace/Featherless, Moonshot, and custom OpenAI-compatible endpoints.
- Curated/static model catalogs are fallback-only for offline/unauthorized providers, not mixed into successful live catalogs.
- Chat/Agentic dropdowns filter non-chat deployments such as embeddings, image, video, audio, speech, moderation, and rerank models.
- Live context-window/max-output metadata is used where exposed, with safe 64K default context budgeting to prevent accidental GPT-5.5/GPT-5.4 1M-token spend.
- Azure Cost-Smart Production profile remains the recommended default for high-quality work without unnecessary GPT-5.5 input/cache-input burn.

## Recommended cost posture

Use GPT-4.1 as main orchestrator for routine coding, Grok-4.3 as challenger/reviewer, cheaper workers only for extraction/boilerplate, and GPT-5.5 only for final hard critique, architecture/security review, financial strategy, or unresolved disagreements.
