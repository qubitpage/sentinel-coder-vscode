# Providers, Models, API Keys, and Live Discovery

This guide explains how Sentinel Coder One Studio handles providers, API keys, model dropdowns, context windows, tool support, and pricing/free-tier labels.

---

## 1. Provider principles

Sentinel is provider-neutral and bring-your-own-key:

- You decide which providers are configured.
- You choose a single model or an opt-in Agentic Profile.
- Live provider catalogs are preferred when available.
- Curated/hardcoded models are fallback only.
- Secrets must never be committed or packaged.

---

## 2. Supported provider families

Common configurations include:

| Provider family | Typical use | Discovery behavior |
| --- | --- | --- |
| Azure OpenAI / Azure AI Foundry | Enterprise deployments, managed access, large context, media deployments | Deployment/model APIs when configured |
| OpenAI-compatible | OpenAI, private gateways, Mistral-compatible, Together-compatible, custom routers | `/models` when supported |
| OpenRouter | Multi-vendor catalog, free and paid models | Live catalog with pricing/context metadata where exposed |
| Groq | Fast OSS inference and fan-out | Live model list where supported |
| Anthropic | High-quality coding/review | Provider metadata/fallback when needed |
| Mistral / DeepSeek / Together / Vultr / Featherless / Moonshot | Specialized and regional model access | OpenAI-compatible metadata where available |
| Ollama | Local/private/zero-cloud inference | Local endpoint model list |

---

## 3. Adding API keys safely

Recommended order:

1. Use the Sentinel provider settings UI.
2. Use VS Code secret storage-backed flows when available.
3. Use environment variables for devcontainers/CI.
4. Use a git-ignored local secrets file only when necessary.

Do not place real keys in:

- `README.md`, docs, or examples.
- `.vscode/settings.json` that will be committed.
- Source files.
- Screenshots.
- GitHub Issues.
- VSIX package artifacts.

Example placeholder style:

```text
AZURE_OPENAI_API_KEY=<redacted>
OPENROUTER_API_KEY=<redacted>
GROQ_API_KEY=<redacted>
```

Never publish the real value.

---

## 4. Live model dropdown behavior

The chat model selector is designed to be understandable at scale:

1. Agentic Modes.
2. Most used models and modes.
3. All configured/discovered models grouped by provider.
4. Provider subcategories such as Local, Free, Free-tier, Subscription, Paid, or Unknown.
5. Context, pricing, capability, and status badges where available.

Agentic Profile settings use the same live model registry, so users select workers/reviewers from dropdowns instead of manually typing model IDs.

---

## 5. Context and output limits

Sentinel attempts to detect:

- Context window.
- Output token limit.
- Native tool support.
- Supported request parameters.
- Modalities and chat compatibility.

Because provider metadata is inconsistent, Sentinel uses layered evidence:

1. Live provider metadata.
2. Known provider-specific fields such as `supported_parameters`, `context_length`, `max_tokens`, or deployment metadata.
3. Curated fallback heuristics.
4. Runtime learning from provider errors.

If a model rejects unsupported native tool parameters, Sentinel should disable that operation for the session and retry safely without those parameters.

---

## 6. Free vs paid model labels

Free/free-tier labels are based on provider catalog metadata when available. They can change over time. Treat them as operational hints, not contractual billing guarantees.

Before high-volume use:

- Check the provider billing page.
- Confirm rate limits.
- Run a small test request.
- Monitor first-day usage.
- Use the cost footer/model-usage telemetry.

---

## 7. Recommended provider strategies

### Cost-smart Azure setup

- Daily orchestrator: GPT-4.1 or the cheapest strong Azure deployment that passes your coding tests.
- Hard critic/reviewer: a different strong model/provider when configured.
- Final review only: GPT-5.5/frontier deployment for high-risk tasks.
- Budget: keep default context budget at 64K until a task justifies more.

### Free-only testing setup

- Use `FREE:` Agentic profiles.
- Prefer local Ollama for private drafts.
- Use Groq/OpenRouter free/free-tier workers for summaries and low-risk drafts.
- Always verify generated code with tests and compile.

### Enterprise review setup

- Single-model for normal code changes.
- Agentic profile for high-risk release gates.
- Reviewer from a different provider or model family.
- Firewall scan and package inspection before publishing.

---

## 8. Troubleshooting provider setup

### Key accepted but models missing

- Check provider base URL.
- Confirm deployment name vs model name.
- Refresh models.
- Confirm the provider exposes a compatible catalog endpoint.
- Check corporate proxy/firewall settings.

### Model appears but request fails

- Verify chat-completion support.
- Verify context window and max output.
- Check whether the model supports tools/function calling.
- Try single-model Ask mode first.
- Reduce context budget.

### Costs higher than expected

- Lower `sentinelCoder.contextBudgetTokens`.
- Disable unnecessary dynamic-context sources.
- Use free/local workers for drafts.
- Avoid using frontier models as default workers.
- Use Agentic only when the task benefits from orchestration.
