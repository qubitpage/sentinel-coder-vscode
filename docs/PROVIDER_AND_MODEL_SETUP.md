# Provider and Model Setup

Sentinel Coder One Studio is provider-neutral. It can use one strong model directly or orchestrate multiple models through Agentic Profiles.

## Provider setup checklist

For each provider:

1. Create the provider account/resource.
2. Create or deploy chat-capable models.
3. Copy the endpoint/base URL if required.
4. Add the provider in Sentinel settings.
5. Store keys in VS Code SecretStorage or a git-ignored secrets file.
6. Press refresh/discover models.
7. Confirm the model appears in the categorized chat selector.
8. Send a small test request.

## Azure OpenAI / Azure AI Foundry

Recommended for enterprise deployments when Azure credits/governance are available.

Needed values:

- Endpoint/resource URL.
- API version.
- Deployment names.
- API key or managed credential pattern supported by your environment.

Sentinel discovers Azure deployments where the API exposes them and filters non-chat deployments from chat selectors.

Recommended use:

- GPT-4.1 class: strong daily coding/orchestration.
- GPT-5.x / GPT-5.5 class: high-risk final review, architecture, long-context reasoning, hard debugging.
- Azure image/audio/video deployments: Studio media workflows.

Cost control:

- Keep `contextBudgetTokens` conservative.
- Use Agentic Profiles to route bulk reading/drafting to cheaper/free workers.
- Use frontier models for final synthesis and high-risk review.

## OpenRouter

OpenRouter is useful for multi-model experimentation and free-tier testing. Sentinel reads catalog metadata where available, including supported parameters and pricing notes.

Recommended use:

- Free-only Agentic profiles for experiments.
- Cross-provider critique.
- Specialized models that are not deployed in your Azure account.

## Groq

Groq is useful for fast worker/reviewer roles when models are available in your account.

Recommended use:

- Fast code reading.
- Draft generation.
- Low-latency critique.

## Anthropic / Claude

Useful for architecture, review, and long-form reasoning when configured through a supported API pattern.

Recommended use:

- Reviewer role in Agentic Profiles.
- Safety/security critique.
- Documentation synthesis.

## OpenAI-compatible custom providers

Use an OpenAI-compatible base URL and key. Sentinel attempts live model discovery and falls back to curated/static entries only when discovery is unavailable.

## Ollama local models

Available in VS Code Desktop when Ollama is running locally.

Recommended use:

- Private local coding tasks.
- Cost-free drafts.
- Offline experiments.

Browser note: vscode.dev cannot call your local Ollama daemon directly. Use desktop VS Code or a secure Remote Tool Bridge.

## Best-practice model routing

- **Single model**: choose the strongest affordable model and keep latency low.
- **Cost-saving Agentic**: strong orchestrator + cheap/free workers + independent reviewer.
- **Security Agentic**: strong orchestrator + different-provider reviewer + firewall scan.
- **Free-only Agentic**: free OpenRouter/Groq/Ollama-style workers for exploration; expect lower reliability and add human review.
