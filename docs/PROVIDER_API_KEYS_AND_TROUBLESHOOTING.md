# Provider, API Key, and Troubleshooting Guide

This guide explains how to configure providers safely in Sentinel Coder One Studio.

> Never commit API keys, bearer tokens, connection strings, private endpoints, or generated local configuration to GitHub or Marketplace packages.

---

## Safe key handling

Use one of these patterns:

1. Extension settings/secret storage where supported.
2. Environment variables in your local shell/profile.
3. A git-ignored secrets file referenced by the extension setting.
4. Enterprise secret managers injected into the runtime environment.

Avoid:

- Pasting keys into source files.
- Adding keys to README/docs/examples.
- Uploading screenshots that show keys.
- Committing `.env`, API-key text files, or private provider configuration.

---

## Provider checklist

For each provider:

1. Add provider name/type.
2. Add base URL if the provider is OpenAI-compatible or custom.
3. Add API key securely.
4. Refresh models/deployments.
5. Confirm the desired model appears in the categorized selector.
6. Send a small test prompt.
7. Check token/context metadata.
8. If tool calling fails, rely on operation-aware fallback and report the provider/model in GitHub Issues without secrets.

---

## Azure OpenAI / Azure AI Foundry

Recommended configuration fields:

- Resource endpoint/base URL.
- Deployment name.
- API version.
- API key or managed enterprise credential pattern where implemented.

Operational notes:

- Azure deployments are often deployment-name based, not raw model-name based.
- Live deployment discovery should be treated as authoritative when the API succeeds.
- Context/output metadata may vary by deployment and API version.
- Some GPT-5.x deployments may not support the same native tool operation as GPT-4.1-class deployments. Sentinel should route operations according to detected capability.

Cost notes:

- Use GPT-4.1-class or other capable mid/frontier models for most implementation.
- Use GPT-5.5-class models for difficult architecture, security, finance, final review, and unresolved disagreements.
- Keep context budgets intentional.

---

## OpenRouter

OpenRouter is useful for broad model discovery and comparing providers. Where metadata is available, Sentinel should display:

- Free/free-tier labels.
- Context window.
- Supported parameters.
- Pricing notes.
- Provider/model family.

Free models can be rate-limited or temporarily unavailable. Use them for drafts, extraction, tests, docs, and brainstorming; verify before applying changes.

---

## Groq

Groq is useful for low-latency fan-out, summaries, and draft workers.

Best uses:

- Parallel code reading.
- Test idea generation.
- Fast critique.
- Summaries and extraction.

Always verify outputs against the actual codebase.

---

## Ollama/local

Ollama is useful for privacy and zero cloud spend.

Checklist:

- Confirm Ollama is running locally.
- Confirm model is pulled.
- Confirm system has enough CPU/GPU memory.
- Keep parallel Agentic workers low.

Local models vary significantly by hardware and model quality. Treat them as private workers/reviewers unless proven strong for final decisions.

---

## Anthropic/OpenAI-compatible/Mistral/DeepSeek/Together/Vultr/HuggingFace/Moonshot

For OpenAI-compatible providers:

- Set provider base URL.
- Set API key.
- Refresh `/models` where available.
- Verify chat completion compatibility.
- Use provider metadata where exposed; fallback labels are not guarantees.

---

## Common errors

### 401/403 authentication

- Key missing, expired, wrong provider, or insufficient permission.
- Confirm the key is not accidentally copied with spaces/newlines.

### 404 model/deployment not found

- Azure deployment name may differ from model name.
- Provider catalog may need refresh.
- Base URL/API version may be wrong.

### 429 rate limited

- Reduce parallel Agentic workers.
- Switch to a paid model/provider.
- Use a local model for drafts.
- Increase provider quota where appropriate.

### Unsupported operation/tools

- The selected model may not support native tool calling or `tool_choice`.
- Sentinel should route unsupported operations as normal chat and use host tools through the extension agent loop instead of provider-native tool parameters.

### Model appears but fails generation

- The provider may list non-chat or restricted models.
- Check provider metadata, supported parameters, and deployment permissions.

---

## Reporting issues safely

When opening a GitHub issue, include:

- Provider family.
- Model/deployment name if not sensitive.
- VS Code version.
- Sentinel version.
- Desktop or Web.
- Sanitized error message.
- Steps to reproduce.

Do not include keys, tokens, private endpoints, account IDs, or customer data.
