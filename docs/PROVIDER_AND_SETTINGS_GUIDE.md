# Provider and settings guide

This guide explains how to configure Sentinel Coder One Studio without hardcoding secrets.

> Security rule: never commit API keys, personal access tokens, connection strings, private endpoints, customer data, or generated local secrets. Use VS Code SecretStorage, environment variables, provider settings, or a git-ignored local key file.

## 1. Choosing a mode

Sentinel has two model-selection patterns:

### Single-model mode

Choose a normal model from the model dropdown. Sentinel uses that model directly at its detected capability.

Use this when:

- You want GPT-4.1, GPT-5.5, Grok, Claude, Groq, OpenRouter, Ollama, or another configured model to work alone.
- You want predictable cost and behavior.
- You are debugging provider-specific issues.

### Agentic Profile mode

Choose an `Agentic:` profile. Sentinel runs opt-in orchestration with a main model plus worker/reviewer agents.

Use this when:

- You want hard critique, security review, testing ideas, or multi-model comparison.
- You want cheap/free workers for drafts and premium models for final judgment.
- You want a repeatable enterprise workflow.

## 2. Model selector organization

The chat selector is organized for fast selection:

1. **Agentic Modes** - configured orchestration profiles.
2. **Most used models and modes** - common daily choices and recommended profiles.
3. **All models by provider** - Azure, OpenAI-compatible, OpenRouter, Groq, Anthropic, Ollama, local/private, and custom providers.
4. **Price class subgroups** - Local, Free, Free-tier, Subscription, Paid, or Unknown.

Where provider APIs expose metadata, Sentinel refreshes model IDs, context windows, output limits, pricing hints, and capability badges dynamically.

## 3. API key setup

### Recommended: VS Code settings UI

1. Open the Sentinel Coder One Studio sidebar.
2. Open Settings / Providers.
3. Add a provider.
4. Paste the API key into the secret field.
5. Save and refresh the provider catalog.

Secrets should be stored through VS Code secret storage or local settings, not committed to Git.

### Environment variables

For automation or enterprise images, prefer environment variables managed by your OS, CI runner, or secret manager.

Examples:

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `ANTHROPIC_API_KEY`
- `MISTRAL_API_KEY`
- `DEEPSEEK_API_KEY`
- `TOGETHER_API_KEY`
- `HF_TOKEN`

### Git-ignored bulk key file

Sentinel can read a local API-key file if configured. Keep it outside the repository or add it to `.gitignore`. Never publish it.

## 4. Azure OpenAI / Azure AI Foundry

Recommended fields:

- Endpoint / resource URL.
- API key or managed identity flow where available.
- API version.
- Deployment names.
- Optional live deployment discovery.

Azure model names are deployment-specific. Sentinel tries to detect deployments and metadata from the Azure API when permissions allow it.

Cost strategy:

- Use GPT-4.1-class models for strong daily development where available.
- Use GPT-5.5-class long-context models only when the task benefits from deep context or final high-risk review.
- Keep `sentinelCoder.contextBudgetTokens` conservative by default; raise it only when you intentionally need deep context.

## 5. OpenRouter

OpenRouter can expose many free, free-tier, paid, and provider-routed models. Sentinel reads live model metadata where available, including `supported_parameters`, context length, and pricing hints.

Best practice:

- Use free models for drafts, extraction, and brainstorming.
- Use paid/reasoning models for final code review, architecture, or security-sensitive work.
- Verify tool-call support from live metadata instead of assuming every model supports native tools.

## 6. Groq

Groq is useful for fast workers, fast code reading, and low-latency reviews. Sentinel can use Groq models directly or as worker agents in Agentic Profiles.

Best practice:

- Use fast Groq models for parallel review/draft workers.
- Keep premium final review on a stronger reasoning model if the code is high-risk.

## 7. Anthropic/OpenAI-compatible/custom providers

Sentinel supports provider adapters and OpenAI-compatible APIs where the provider exposes chat completions or compatible routes.

For custom providers, configure:

- Base URL.
- API key.
- Provider label.
- Model discovery route if available.
- Chat endpoint compatibility.

If live discovery fails, Sentinel can fall back to curated or manually configured entries, but live provider catalogs are preferred.

## 8. Ollama and local models

Ollama is recommended for private/local drafts, codebase reading, and offline work.

Default endpoint:

```text
http://127.0.0.1:11434
```

Best practice:

- Use local models for privacy-sensitive preflight when quality is sufficient.
- Do not assume local models have large context or tool-call support unless detected.
- Pair local workers with a stronger cloud reviewer for critical changes.

## 9. Studio/media settings

The Studio can organize generated content under `.sentinel/generated` folders:

- Images.
- Video.
- Audio.
- Documents.
- Presentations.
- Reports.
- Templates.

Provider support depends on configured services. If video/image/audio generation is unavailable, Sentinel should report that honestly instead of faking output.

## 10. VS Code Web and Remote Tool Bridge

Browser extensions cannot directly run local terminals, Docker, SSH, local Ollama, or native MCP processes. Sentinel Web mode should still be useful by routing eligible remote operations through a configured secure bridge.

Use the Remote Tool Bridge only when:

- You control the bridge endpoint.
- TLS is enabled.
- Authentication is configured.
- Commands are allow-listed or policy-controlled.
- Logs do not expose secrets.

Desktop remains the recommended mode for unrestricted local automation.

## 11. Troubleshooting

### Model does not appear

- Refresh provider catalogs.
- Check API key and endpoint.
- Confirm the provider exposes a model listing route.
- Confirm the model is chat-capable.
- Check workspace/network proxy restrictions.

### Context window is outdated

- Refresh provider metadata.
- Check whether the provider API exposes context values.
- If not exposed, Sentinel may use fallback metadata.
- Raise or lower `sentinelCoder.contextBudgetTokens` based on cost tolerance.

### Native tool call fails

- Some models reject OpenAI-style native tool parameters.
- Sentinel uses operation-aware routing and learns from provider rejections.
- If a provider rejects tools, Sentinel should retry as normal chat and remember that capability result for the session.

### Web extension says unavailable

- Ensure the web VSIX was packaged and published.
- Check `browser`, `extensionKind`, `out/extensionWeb.js`, and web-compatible activation.
- Marketplace indexing may lag after publish.
