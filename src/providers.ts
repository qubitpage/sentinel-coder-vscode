import * as https from "https";
import * as http from "http";
import * as vscode from "vscode";

// ── Types ─────────────────────────────────────────────────────────
export interface ToolCallSpec {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallSpec[];
  tool_call_id?: string;
  name?: string;
}

/** OpenAI-style function tool spec passed to native tool-calling models. */
export interface OpenAIToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Event emitted by streamChatEvents during a native tool-calling stream. */
export type StreamEvent =
  | { kind: "text"; value: string }
  | { kind: "tool_calls"; calls: ToolCallSpec[] };

export interface ProviderConfig {
  id: string;
  name: string;
  type: "ollama" | "openai" | "anthropic" | "google" | "groq" | "openrouter" | "mistral" | "deepseek" | "together" | "vultr" | "huggingface" | "featherless" | "azure" | "azure-sora" | "moonshot" | "custom-openai";
  baseUrl: string;
  apiKey?: string;
  apiVersion?: string;   // Azure OpenAI api-version (azure type only)
  models: ModelConfig[];
  enabled: boolean;
}

export type PricingTier = "free" | "free-tier" | "pay-per-use" | "subscription" | "local";

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: string;
  maxOutputTokens?: number;
  contextWindow: number;       // displayed/advertised context in tokens
  /** Optional provider-enforced request cap. Some Azure/Foundry endpoints advertise larger context than the live endpoint accepts. */
  effectiveContextWindow?: number;
  pricing: PricingTier;
  pricingNote?: string;        // e.g. "$3/1M input", "Free 14k req/day"
  supportsTools: boolean;
  /** Provider/API-advertised request parameters, when available (for example: tools, tool_choice, response_format). */
  supportedParameters?: string[];
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface ModelOption {
  id: string;           // "provider:modelId"
  displayName: string;
  provider: string;     // provider id
  providerType: string;
  contextWindow: number;
  effectiveContextWindow?: number;
  maxOutputTokens: number;
  pricing: PricingTier;
  pricingNote: string;
  supportsTools: boolean;
  /** Provider/API-advertised request parameters, when available (for example: tools, tool_choice, response_format). */
  supportedParameters?: string[];
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  /** Where the context/max-output metadata came from: provider API, curated heuristic, or static catalog.
   * Live API catalog entries are preferred for dropdowns. Curated entries are fallback only.
   * Chat/Agentic selectors intentionally exclude known non-chat media/embedding deployments. */
  contextSource?: "live-api" | "live-api+heuristic" | "heuristic" | "static";
  /** Unix timestamp (ms) when live context metadata was refreshed for this option. */
  contextUpdatedAt?: number;
}

// Shape of a model entry returned by OpenRouter and OpenAI-compatible /models endpoints.
interface OpenRouterApiModel {
  id: string;
  name?: string;
  display_name?: string;
  model?: string;
  context_length?: number;
  context_window?: number;
  context_window_tokens?: number;
  max_context_length?: number;
  max_input_tokens?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  input_token_limit?: number;
  output_token_limit?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string; tokenizer?: string };
  top_provider?: { max_completion_tokens?: number; context_length?: number; max_tokens?: number };
  supported_parameters?: string[];
  capabilities?: Record<string, unknown>;
  permission?: unknown;
  object?: string;
}

interface LiveModelMetadata {
  id: string;
  displayName?: string;
  providerModelId?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  /** Raw provider-advertised request parameters, e.g. OpenRouter supported_parameters. */
  supportedParameters?: string[];
  /** Explicit provider/model support for Chat Completions native tools, when the live API exposes it. */
  supportsTools?: boolean;
  supportsThinking?: boolean;
  supportsVision?: boolean;
  source: "live-api" | "live-api+heuristic" | "heuristic";
  updatedAt: number;
}

// ── Default providers (sorted alphabetically) ────────────────────
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  // ── Anthropic ── (Paid: pay-per-use via API key)
  {
    id: "anthropic", name: "Anthropic", type: "anthropic",
    baseUrl: "https://api.anthropic.com", apiKey: "", enabled: false,
    models: [
      { id: "claude-opus-4-20250514", displayName: "Claude Opus 4", provider: "anthropic", contextWindow: 200000, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "$15/M in · $75/M out", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", provider: "anthropic", contextWindow: 200000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "$3/M in · $15/M out", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku", provider: "anthropic", contextWindow: 200000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.25/M in · $1.25/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
    ]
  },
  // ── Azure OpenAI / AI Foundry ── (Your Azure resource — key from SecretStorage, never bundled)
  {
    id: "azure", name: "Azure OpenAI (Foundry)", type: "azure",
    baseUrl: "https://qubitpage-resource.cognitiveservices.azure.com",
    apiVersion: "2024-12-01-preview", apiKey: "", enabled: false,
    models: [
      // NOTE: model id = Azure *deployment name* on your qubitpage-resource (rg-qubitpage, swedencentral)
      { id: "gpt-5.5", displayName: "Azure GPT-5.5 (frontier)", provider: "azure", contextWindow: 1048576, maxOutputTokens: 128000, pricing: "subscription", pricingNote: "Azure credits · frontier reasoning · auto-refreshed context", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "gpt-5.4-pro", displayName: "Azure GPT-5.4 Pro", provider: "azure", contextWindow: 1048576, maxOutputTokens: 128000, pricing: "subscription", pricingNote: "Azure credits · premium fallback for difficult work · auto-refreshed context", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "gpt-5.4", displayName: "Azure GPT-5.4", provider: "azure", contextWindow: 1048576, maxOutputTokens: 65536, pricing: "subscription", pricingNote: "Azure credits · secondary premium agent · auto-refreshed context", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "gpt-4.1", displayName: "Azure GPT-4.1", provider: "azure", contextWindow: 1048576, maxOutputTokens: 32768, pricing: "subscription", pricingNote: "Azure credits · your deployment", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "model-router", displayName: "Azure Model Router", provider: "azure", contextWindow: 200000, maxOutputTokens: 32768, pricing: "subscription", pricingNote: "Azure credits · auto-routes", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "grok-4.3", displayName: "Azure Grok 4.3", provider: "azure", contextWindow: 322000, effectiveContextWindow: 190000, maxOutputTokens: 32768, pricing: "subscription", pricingNote: "Azure credits · live request cap 190K (endpoint max 200K) · auto-refreshed context", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "grok-4.2", displayName: "Azure Grok 4.2", provider: "azure", contextWindow: 256000, effectiveContextWindow: 190000, maxOutputTokens: 32768, pricing: "subscription", pricingNote: "Azure credits · live request cap 190K (endpoint max 200K) · auto-refreshed context", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "gpt-chat-latest", displayName: "Azure GPT Chat (latest)", provider: "azure", contextWindow: 128000, maxOutputTokens: 16384, pricing: "subscription", pricingNote: "Azure credits · your deployment", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
    ]
  },
  // ── Azure Foundry Sora / Video ── (separate endpoint/key can be saved in Providers)
  {
    id: "azure-sora", name: "Azure Foundry Sora 2 (Video)", type: "azure-sora",
    baseUrl: "https://qubitpage-resource.services.ai.azure.com",
    apiVersion: "v1", apiKey: "", enabled: false,
    models: [
      { id: "sora-2", displayName: "Azure Sora 2 (video)", provider: "azure-sora", contextWindow: 4096, maxOutputTokens: 0, pricing: "subscription", pricingNote: "Azure credits · video generation", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: false },
    ]
  },
  // ── DeepSeek ── (Paid: very cheap pay-per-use)
  {
    id: "deepseek", name: "DeepSeek", type: "deepseek",
    baseUrl: "https://api.deepseek.com", apiKey: "", enabled: false,
    models: [
      { id: "deepseek-chat", displayName: "DeepSeek V3", provider: "deepseek", contextWindow: 64000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.27/M in · $1.1/M out", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "deepseek-reasoner", displayName: "DeepSeek R1 (Reasoning)", provider: "deepseek", contextWindow: 64000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.55/M in · $2.19/M out", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Featherless ── (Subscription/pro account, OpenAI-compatible)
  {
    id: "featherless", name: "Featherless", type: "featherless",
    baseUrl: "https://api.featherless.ai", apiKey: "", enabled: false,
    models: [
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct", displayName: "Featherless Llama 3.1 8B", provider: "featherless", contextWindow: 131072, maxOutputTokens: 8192, pricing: "subscription", pricingNote: "Featherless Pro · OpenAI-compatible", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "meta-llama/Llama-3.3-70B-Instruct", displayName: "Featherless Llama 3.3 70B", provider: "featherless", contextWindow: 131072, maxOutputTokens: 8192, pricing: "subscription", pricingNote: "Featherless Pro · OpenAI-compatible", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "Qwen/Qwen3-Coder-480B-A35B-Instruct", displayName: "Featherless Qwen3 Coder 480B", provider: "featherless", contextWindow: 262144, maxOutputTokens: 16384, pricing: "subscription", pricingNote: "Featherless Pro · coding", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "moonshotai/Kimi-K2-Instruct", displayName: "Featherless Kimi K2", provider: "featherless", contextWindow: 131072, maxOutputTokens: 8192, pricing: "subscription", pricingNote: "Featherless Pro", supportsTools: false, supportsThinking: true, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Google AI ── (Free tier: generous free quota)
  {
    id: "google", name: "Google AI (Gemini)", type: "google",
    baseUrl: "https://generativelanguage.googleapis.com", apiKey: "", enabled: false,
    models: [
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google", contextWindow: 1048576, maxOutputTokens: 65536, pricing: "free-tier", pricingNote: "Free 25 req/min, paid $1.25-2.50/M", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "google", contextWindow: 1048576, maxOutputTokens: 65536, pricing: "free-tier", pricingNote: "Free 500 req/day, paid $0.15/M", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "google", contextWindow: 1048576, maxOutputTokens: 8192, pricing: "free-tier", pricingNote: "Free 1500 req/day", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
    ]
  },
  // ── Groq ── (Free: extremely fast inference, free API)
  {
    id: "groq", name: "Groq", type: "groq",
    baseUrl: "https://api.groq.com", apiKey: "", enabled: false,
    models: [
      { id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", provider: "groq", contextWindow: 128000, maxOutputTokens: 32768, pricing: "free", pricingNote: "Free · rate limited", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B Instant", provider: "groq", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · rate limited", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", displayName: "Llama 4 Scout 17B", provider: "groq", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · rate limited", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "qwen/qwen3-32b", displayName: "Qwen3 32B (Thinking)", provider: "groq", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · rate limited", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "openai/gpt-oss-120b", displayName: "GPT OSS 120B (Reasoning)", provider: "groq", contextWindow: 128000, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · rate limited", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "openai/gpt-oss-20b", displayName: "GPT OSS 20B (Reasoning)", provider: "groq", contextWindow: 128000, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · rate limited", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "openai/gpt-oss-120b", displayName: "GPT-OSS 120B", provider: "groq", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · fast worker", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "groq/compound", displayName: "Groq Compound", provider: "groq", contextWindow: 128000, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · compound AI agent", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "groq/compound-mini", displayName: "Groq Compound Mini", provider: "groq", contextWindow: 128000, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free · compound AI agent", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "allam-2-7b", displayName: "Allam 2 7B", provider: "groq", contextWindow: 8192, maxOutputTokens: 4096, pricing: "free", pricingNote: "Free · rate limited", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Hugging Face ── (Free: free inference API)
  {
    id: "huggingface", name: "Hugging Face", type: "huggingface",
    baseUrl: "https://router.huggingface.co", apiKey: "", enabled: false,
    models: [
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct", displayName: "Qwen 2.5 Coder 32B", provider: "huggingface", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free inference API", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "meta-llama/Llama-3.3-70B-Instruct", displayName: "Llama 3.3 70B", provider: "huggingface", contextWindow: 128000, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free inference API", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "mistralai/Mistral-Small-24B-Instruct-2501", displayName: "Mistral Small 24B", provider: "huggingface", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free inference API", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", displayName: "DeepSeek R1 32B", provider: "huggingface", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "Free inference API", supportsTools: false, supportsThinking: true, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Mistral AI ── (Paid: pay-per-use + free tier for small)
  {
    id: "mistral", name: "Mistral AI", type: "mistral",
    baseUrl: "https://api.mistral.ai", apiKey: "", enabled: false,
    models: [
      { id: "mistral-large-latest", displayName: "Mistral Large", provider: "mistral", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$2/M in · $6/M out", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "codestral-latest", displayName: "Codestral", provider: "mistral", contextWindow: 32768, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.3/M in · $0.9/M out", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "mistral-small-latest", displayName: "Mistral Small", provider: "mistral", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free-tier", pricingNote: "Free tier available", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Moonshot AI (Kimi) ── (Official Kimi K2/K2.6 API — OpenAI-compatible. Local 1.1T hosting is infeasible; this is the real path.)
  {
    id: "moonshot", name: "Moonshot AI (Kimi)", type: "moonshot",
    baseUrl: "https://api.moonshot.ai", apiKey: "", enabled: false,
    models: [
      { id: "kimi-latest", displayName: "Kimi (latest — K2.6)", provider: "moonshot", contextWindow: 256000, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "Moonshot API · auto-latest", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "kimi-k2-0905-preview", displayName: "Kimi K2 (0905)", provider: "moonshot", contextWindow: 256000, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "Moonshot API", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "kimi-thinking-preview", displayName: "Kimi K2 Thinking", provider: "moonshot", contextWindow: 256000, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "Moonshot API · reasoning", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "moonshot-v1-128k", displayName: "Moonshot v1 128k", provider: "moonshot", contextWindow: 128000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "Moonshot API", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Ollama (Local) ── (Free: runs locally on your GPU)
  {
    id: "ollama", name: "Ollama (Local)", type: "ollama",
    baseUrl: "http://127.0.0.1:11434", enabled: true, models: []
  },
  // ── QubGPU (MI300X local, vLLM/SGLang OpenAI-compatible) ──
  {
    id: "qubgpu", name: "QubGPU (MI300X local)", type: "custom-openai",
    baseUrl: "http://134.199.206.25:8000", apiKey: "", enabled: false,
    models: [
      { id: "Qwen/Qwen3-Coder-Next", displayName: "Qwen3-Coder-Next (80B-A3B · agentic)", provider: "qubgpu", contextWindow: 262144, maxOutputTokens: 65536, pricing: "local", pricingNote: "Local MI300X · free", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "Qwen/Qwen3-Coder-30B-A3B-Instruct", displayName: "Qwen3-Coder-30B-A3B (fallback)", provider: "qubgpu", contextWindow: 262144, maxOutputTokens: 32768, pricing: "local", pricingNote: "Local MI300X · free", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── OpenAI ── (Paid: pay-per-use via API key)
  {
    id: "openai", name: "OpenAI", type: "openai",
    baseUrl: "https://api.openai.com", apiKey: "", enabled: false,
    models: [
      { id: "gpt-4o", displayName: "GPT-4o", provider: "openai", contextWindow: 128000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "$2.50/M in · $10/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai", contextWindow: 128000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "$0.15/M in · $0.60/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "gpt-4.1", displayName: "GPT-4.1", provider: "openai", contextWindow: 1048576, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "$2/M in · $8/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", provider: "openai", contextWindow: 1048576, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "$0.40/M in · $1.60/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "gpt-4.1-nano", displayName: "GPT-4.1 Nano", provider: "openai", contextWindow: 1048576, maxOutputTokens: 32768, pricing: "pay-per-use", pricingNote: "$0.10/M in · $0.40/M out", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "o3", displayName: "o3 (Reasoning)", provider: "openai", contextWindow: 200000, maxOutputTokens: 100000, pricing: "pay-per-use", pricingNote: "$10/M in · $40/M out", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "o3-mini", displayName: "o3 Mini", provider: "openai", contextWindow: 200000, maxOutputTokens: 65536, pricing: "pay-per-use", pricingNote: "$1.10/M in · $4.40/M out", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "o4-mini", displayName: "o4 Mini", provider: "openai", contextWindow: 200000, maxOutputTokens: 65536, pricing: "pay-per-use", pricingNote: "$1.10/M in · $4.40/M out", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "codex-mini", displayName: "Codex Mini", provider: "openai", contextWindow: 200000, maxOutputTokens: 65536, pricing: "pay-per-use", pricingNote: "$1.50/M in · $6/M out", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── OpenRouter ── (Pay-per-use: aggregator, routes to cheapest provider)
  {
    id: "openrouter", name: "OpenRouter", type: "openrouter",
    baseUrl: "https://openrouter.ai", apiKey: "", enabled: false,
    models: [
      { id: "anthropic/claude-sonnet-4", displayName: "Claude Sonnet 4", provider: "openrouter", contextWindow: 200000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "~$3/M in via OpenRouter", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "openai/gpt-4o", displayName: "GPT-4o", provider: "openrouter", contextWindow: 128000, maxOutputTokens: 16384, pricing: "pay-per-use", pricingNote: "~$2.50/M in via OpenRouter", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "google/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "openrouter", contextWindow: 1048576, maxOutputTokens: 65536, pricing: "pay-per-use", pricingNote: "~$1.25/M in via OpenRouter", supportsTools: true, supportsThinking: true, supportsVision: true, supportsStreaming: true },
      { id: "meta-llama/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B", provider: "openrouter", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "~$0.40/M via OpenRouter", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "qwen/qwen3-235b-a22b", displayName: "Qwen3 235B MoE", provider: "openrouter", contextWindow: 131072, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "~$0.22/M via OpenRouter", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "openrouter/free", displayName: "OpenRouter Free Models Router", provider: "openrouter", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free router · selects a free model dynamically", supportsTools: true, supportsThinking: false, supportsVision: true, supportsStreaming: true },
      { id: "qwen/qwen3-coder:free", displayName: "Qwen3 Coder (Free)", provider: "openrouter", contextWindow: 1048576, maxOutputTokens: 262000, pricing: "free", pricingNote: "OpenRouter free · rate limited", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", displayName: "Qwen3 Next 80B (Free)", provider: "openrouter", contextWindow: 262144, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free · rate limited", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "meta-llama/llama-3.3-70b-instruct:free", displayName: "Llama 3.3 70B (Free)", provider: "openrouter", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free · rate limited", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "meta-llama/llama-3.2-3b-instruct:free", displayName: "Llama 3.2 3B (Free)", provider: "openrouter", contextWindow: 131072, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free · fast fallback", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "liquid/lfm-2.5-1.2b-instruct:free", displayName: "LFM 2.5 1.2B (Free)", provider: "openrouter", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free · smoke-tested", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "mistralai/mistral-small-3.2-24b-instruct:free", displayName: "Mistral Small 3.2 (Free)", provider: "openrouter", contextWindow: 32768, maxOutputTokens: 8192, pricing: "free", pricingNote: "OpenRouter free · if available", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "openrouter", contextWindow: 64000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "~$0.55/M via OpenRouter", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "mistralai/mistral-large", displayName: "Mistral Large", provider: "openrouter", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "~$2/M via OpenRouter", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Together AI ── (Paid: pay-per-use, competitive pricing)
  {
    id: "together", name: "Together AI", type: "together",
    baseUrl: "https://api.together.xyz", apiKey: "", enabled: false,
    models: [
      { id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", displayName: "Llama 3.1 405B Turbo", provider: "together", contextWindow: 130000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$3.50/M · fast inference", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct", displayName: "Qwen 2.5 Coder 32B", provider: "together", contextWindow: 32768, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.80/M", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "deepseek-ai/DeepSeek-R1", displayName: "DeepSeek R1", provider: "together", contextWindow: 64000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$2/M · reasoning model", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "mistralai/Mixtral-8x22B-Instruct-v0.1", displayName: "Mixtral 8x22B", provider: "together", contextWindow: 65536, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "$0.60/M", supportsTools: false, supportsThinking: false, supportsVision: false, supportsStreaming: true },
    ]
  },
  // ── Vultr ── (Paid: Vultr cloud subscription, serverless inference)
  {
    id: "vultr", name: "Vultr Inference", type: "vultr",
    baseUrl: "https://api.vultrinference.com", apiKey: "", enabled: false,
    models: [
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct", displayName: "Qwen 2.5 Coder 32B", provider: "vultr", contextWindow: 32768, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "nvidia/DeepSeek-V3.2-NVFP4", displayName: "DeepSeek V3.2 (NVFP4)", provider: "vultr", contextWindow: 64000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "openai/gpt-oss-120b", displayName: "GPT OSS 120B", provider: "vultr", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true },
      { id: "MiniMaxAI/MiniMax-M2.5", displayName: "MiniMax M2.5", provider: "vultr", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "moonshotai/Kimi-K2.5", displayName: "Kimi K2.5", provider: "vultr", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "zai-org/GLM-5-FP8", displayName: "GLM 5 (FP8)", provider: "vultr", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
      { id: "zai-org/GLM-5.1-FP8", displayName: "GLM 5.1 (FP8)", provider: "vultr", contextWindow: 128000, maxOutputTokens: 8192, pricing: "pay-per-use", pricingNote: "Vultr cloud credits", supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true },
    ]
  },
];

// ── API endpoint mapping ──────────────────────────────────────────
function getChatEndpoint(provider: ProviderConfig, model: string): { path: string; method: string } {
  switch (provider.type) {
    case "ollama": return { path: "/api/chat", method: "POST" };
    case "anthropic": return { path: "/v1/messages", method: "POST" };
    case "google": return { path: `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${provider.apiKey}`, method: "POST" };
    case "groq": return { path: "/openai/v1/chat/completions", method: "POST" };
    case "openrouter": return { path: "/api/v1/chat/completions", method: "POST" };
    case "featherless": return { path: "/v1/chat/completions", method: "POST" };
    case "vultr": return { path: "/v1/chat/completions", method: "POST" };
    case "huggingface": return { path: "/v1/chat/completions", method: "POST" };
    case "azure": {
      const apiVersion = provider.apiVersion || "2024-12-01-preview";
      // model = Azure deployment name
      return { path: `/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`, method: "POST" };
    }
    default: // openai, deepseek, mistral, together, moonshot, custom-openai
      return { path: "/v1/chat/completions", method: "POST" };
  }
}

function buildHeaders(provider: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  switch (provider.type) {
    case "anthropic":
      headers["x-api-key"] = provider.apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "openrouter":
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      headers["HTTP-Referer"] = "https://qubitpage.com";
      headers["X-Title"] = "Sentinel Coder";
      break;
    case "google":
      // API key is in the URL
      break;
    case "ollama":
      // No auth needed
      break;
    case "vultr":
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      break;
    case "huggingface":
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      break;
    case "azure":
      // Azure OpenAI / AI Foundry uses the api-key header, not Bearer
      headers["api-key"] = provider.apiKey || "";
      break;
    default: // openai, deepseek, mistral, together, vultr, moonshot, custom-openai
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      break;
  }
  return headers;
}

// Reasoning / restricted OpenAI-family models (o-series, gpt-5*, codex, gpt-5-chat)
// reject `max_tokens` and any non-default `temperature`; they require
// `max_completion_tokens` and only accept the default temperature.
function isRestrictedOpenAIModel(model: string): boolean {
  const m = (model || "").toLowerCase();
  return /^o[0-9]/.test(m) || m.includes("gpt-5") || m.includes("codex") || m.includes("gpt-chat");
}

// Ranks the latest frontier models so they surface at the top of the catalog
// (lower = higher priority). Tiered by family + version recency.
function frontierRank(displayName: string, id: string): number {
  const s = `${displayName} ${id}`.toLowerCase();
  // Tier 0 — newest top-end frontier
  if (/gpt-5\.5|gpt-5_5/.test(s)) return 0;
  if (/claude.*opus.*4\.8|opus-4\.8/.test(s)) return 1;
  if (/gpt-5\.4/.test(s)) return 2;
  if (/grok.*4\.3|grok-4\.3/.test(s)) return 3;
  if (/gemini.*3(\b|\.| )|gemini-3/.test(s)) return 4;
  if (/claude.*opus.*4\.7|opus-4\.7/.test(s)) return 5;
  if (/kimi.*k2|moonshot.*k2/.test(s)) return 6;
  // Tier 1 — current frontier families
  if (/gpt-5(\b|\.|-| )/.test(s)) return 10;
  if (/claude.*opus.*4|opus-4/.test(s)) return 11;
  if (/claude.*sonnet.*4|sonnet-4/.test(s)) return 12;
  if (/grok-4|grok.*4/.test(s)) return 13;
  if (/gemini.*2\.5|gemini-2\.5/.test(s)) return 14;
  if (/deepseek.*(v3|r1)/.test(s)) return 15;
  if (/o3|o4/.test(s)) return 16;
  // Everything else
  return 100;
}


function estimateMessageTokens(message: ChatMessage): number {
  // Conservative approximation for preflight budgeting. Azure endpoint errors are based on tokenized prompt,
  // but char/4 plus per-message overhead is close enough to prevent oversized requests.
  const content = message.content || "";
  const toolOverhead = message.tool_calls ? JSON.stringify(message.tool_calls).length / 4 : 0;
  return Math.ceil(content.length / 4 + toolOverhead + 12);
}

function modelRuntimeContextWindow(provider: ProviderConfig, model: string): number | undefined {
  const cfg = provider.models.find(m => m.id === model);
  return cfg?.effectiveContextWindow || cfg?.contextWindow;
}

function trimMessagesForRuntimeBudget(provider: ProviderConfig, model: string, messages: ChatMessage[], outputBudget: number): ChatMessage[] {
  const runtimeWindow = modelRuntimeContextWindow(provider, model);
  if (!runtimeWindow || runtimeWindow <= 0) return messages;

  // Keep a safety margin so Azure/Foundry endpoint tokenization differences do not cross hard limits.
  const reservedOutput = Math.max(1024, Math.min(outputBudget || 4096, 32768));
  const promptBudget = Math.max(4096, runtimeWindow - reservedOutput - 2048);
  const total = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  if (total <= promptBudget) return messages;

  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystem = messages.filter(m => m.role !== "system");
  const trimmed: ChatMessage[] = [];
  let used = systemMessages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

  // Walk backwards so recent user/tool context survives. Older middle context is replaced by a compact notice.
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i];
    const cost = estimateMessageTokens(msg);
    if (used + cost <= promptBudget) {
      trimmed.unshift(msg);
      used += cost;
    }
  }

  const omitted = nonSystem.length - trimmed.length;
  if (omitted > 0) {
    trimmed.unshift({
      role: "system",
      content: `Context preflight: omitted ${omitted} older conversation messages to stay below the ${runtimeWindow.toLocaleString()} token live request limit for ${provider.name}/${model}. Recent user instructions, tool outputs, and system policy were preserved.`
    });
  }
  return [...systemMessages, ...trimmed];
}

function buildRequestBody(provider: ProviderConfig, model: string, messages: ChatMessage[], options: { temperature?: number; max_tokens?: number; stream?: boolean; tools?: OpenAIToolSpec[]; toolChoice?: boolean }): string {
  const stream = options.stream !== false;
  const runtimeMessages = trimMessagesForRuntimeBudget(provider, model, messages, options.max_tokens || 4096);
  switch (provider.type) {
    case "ollama":
      return JSON.stringify({
        model, messages: runtimeMessages, stream,
        options: { temperature: options.temperature ?? 0.3, num_predict: options.max_tokens ?? 2048 }
      });
    case "anthropic": {
      const system = runtimeMessages.find(m => m.role === "system")?.content || "";
      const nonSystem = runtimeMessages.filter(m => m.role !== "system");
      return JSON.stringify({
        model, system, messages: nonSystem, stream,
        max_tokens: options.max_tokens || 4096, temperature: options.temperature ?? 0.3
      });
    }
    case "google":
      return JSON.stringify({
        contents: runtimeMessages.filter(m => m.role !== "system").map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        systemInstruction: { parts: [{ text: runtimeMessages.find(m => m.role === "system")?.content || "" }] },
        generationConfig: { temperature: options.temperature ?? 0.3, maxOutputTokens: options.max_tokens || 4096 }
      });
    default: { // OpenAI-compatible
      const restricted = (provider.type === "azure" || provider.type === "openai") && isRestrictedOpenAIModel(model);
      const body: Record<string, unknown> = { model, messages: runtimeMessages, stream };
      if (restricted) {
        // Reasoning models: use max_completion_tokens, and omit temperature
        // (only the default value is accepted).
        body.max_completion_tokens = options.max_tokens || 4096;
      } else {
        body.temperature = options.temperature ?? 0.3;
        body.max_tokens = options.max_tokens || 4096;
      }
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
        if (options.toolChoice !== false) {
          body.tool_choice = "auto";
        }
      }
      return JSON.stringify(body);
    }
  }
}

/** OpenAI-compatible provider types that can support native function/tool calling. */
const NATIVE_TOOL_TYPES = new Set([
  "openai", "azure", "groq", "openrouter", "deepseek", "mistral", "together", "vultr", "huggingface", "moonshot", "custom-openai"
]);
export function providerSupportsNativeTools(type: string): boolean {
  return NATIVE_TOOL_TYPES.has(type);
}

function truthyCapability(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1" || value === 1 || value === "enabled" || value === "supported") return true;
  if (value === false || value === "false" || value === "0" || value === 0 || value === "disabled" || value === "unsupported") return false;
  return undefined;
}

function capabilityRecordSaysTools(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const directKeys = [
    "tools", "tool", "tool_choice", "toolChoice", "function_calling", "functionCalling",
    "function_call", "functionCall", "functions", "parallel_tool_calls", "parallelToolCalls"
  ];
  for (const key of directKeys) {
    const verdict = truthyCapability(obj[key]);
    if (verdict !== undefined) return verdict;
  }
  for (const nestedKey of ["capabilities", "features", "supported", "supported_parameters", "supportedParameters"]) {
    const nested = obj[nestedKey];
    if (Array.isArray(nested)) {
      const lowered = nested.map(v => String(v).toLowerCase());
      if (lowered.some(v => ["tools", "tool_choice", "function_calling", "functions", "parallel_tool_calls"].includes(v))) return true;
    } else {
      const verdict = capabilityRecordSaysTools(nested);
      if (verdict !== undefined) return verdict;
    }
  }
  return undefined;
}

function liveEntrySaysTools(entry: OpenRouterApiModel): boolean | undefined {
  const params = Array.isArray(entry.supported_parameters) ? entry.supported_parameters.map(p => String(p).toLowerCase()) : [];
  if (params.length > 0) {
    return params.some(p => ["tools", "tool_choice", "function_calling", "functions", "parallel_tool_calls"].includes(p));
  }
  return capabilityRecordSaysTools(entry.capabilities);
}

function defaultNativeToolSupportForChatCompletions(provider: ProviderConfig, modelId: string, displayName?: string, catalogSupportsTools?: boolean): boolean {
  if (!providerSupportsNativeTools(provider.type)) return false;
  if (catalogSupportsTools === false) return false;
  const name = `${modelId} ${displayName || ""}`.toLowerCase();

  // Azure OpenAI/AI Foundry is operation-specific: a deployment can chat/stream normally
  // while rejecting Chat Completions native tools with HTTP 400 "operation unsupported".
  // Enable tools only for Azure deployments known to support Chat Completions tools unless
  // a live API capability explicitly says otherwise.
  if (provider.type === "azure") {
    if (/gpt[-_ ]?4\.1|gpt[-_ ]?4o|gpt[-_ ]?4[-_ ]turbo|gpt-chat-latest/.test(name)) return true;
    if (/gpt[-_ ]?5|grok|model-router|router/.test(name)) return false;
    return catalogSupportsTools === true;
  }

  // OpenRouter exposes model-level supported_parameters; respect the catalog instead of
  // assuming every routed model accepts native tools.
  if (provider.type === "openrouter") return catalogSupportsTools === true;

  // For direct OpenAI-compatible providers, allow native tools by default when the catalog
  // does not explicitly deny them; these APIs generally accept OpenAI tools syntax.
  return true;
}

// Force localhost to 127.0.0.1 to avoid IPv6 issues
function forceIPv4(hostname: string): string {
  return hostname === "localhost" ? "127.0.0.1" : hostname;
}

function isRetryableNetworkError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timeout|aborted/i.test(text);
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function isUnsupportedOperationResponse(statusCode: number | undefined, body: string): boolean {
  if (statusCode !== 400) return false;
  return /requested operation is unsupported|operation is unsupported|unsupported operation|not supported/i.test(body || "");
}

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error("Request cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Parse streaming chunks per provider.
function parseStreamChunk(provider: ProviderConfig, line: string): string {
  switch (provider.type) {
    case "ollama": {
      try {
        const d = JSON.parse(line);
        return d.response || d.message?.content || "";
      } catch { return ""; }
    }
    case "anthropic": {
      if (!line.startsWith("data: ")) return "";
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return "";
      try {
        const d = JSON.parse(payload);
        if (d.type === "content_block_delta" && d.delta?.text) return d.delta.text;
        return "";
      } catch { return ""; }
    }
    case "google": {
      if (!line.startsWith("data: ")) return "";
      const payload2 = line.slice(6).trim();
      try {
        const d = JSON.parse(payload2);
        return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch { return ""; }
    }
    default: {  // OpenAI-compatible (openai, groq, openrouter, deepseek, mistral, together, vultr, huggingface)
      if (!line.startsWith("data: ")) return "";
      const payload3 = line.slice(6).trim();
      if (payload3 === "[DONE]") return "";
      try {
        const d = JSON.parse(payload3);
        const delta = d.choices?.[0]?.delta;
        if (!delta) return "";
        let text = "";
        // Handle thinking/reasoning models that stream via delta.reasoning
        if (delta.reasoning) {
          text += "<think>" + delta.reasoning + "</think>";
        }
        if (delta.content) {
          text += delta.content;
        }
        return text;
      } catch { return ""; }
    }
  }
}

function isDone(provider: ProviderConfig, line: string): boolean {
  if (provider.type === "ollama") {
    try { return JSON.parse(line).done === true; } catch { return false; }
  }
  return line.trim() === "data: [DONE]";
}

// ── Multi-Provider Client ─────────────────────────────────────────
export class MultiProviderClient {
  private _providers: Map<string, ProviderConfig> = new Map();
  // Per-provider session usage (this VS Code session). Token counts are
  // estimated from message/response text (~4 chars/token) because most
  // streaming endpoints do not return a usage object on every call.
  private _usage: Map<string, { requests: number; inputTokensEst: number; outputTokensEst: number }> = new Map();
  private _liveModelMetadataCache: Map<string, { expiresAt: number; metadata: Map<string, LiveModelMetadata> }> = new Map();
  private _nativeToolsDisabledForSession: Set<string> = new Set();

  constructor() {
    for (const p of DEFAULT_PROVIDERS) {
      this._providers.set(p.id, { ...p, models: p.models.map(m => ({ ...m })) });
    }
  }

  /** Record estimated usage for a provider after a completion. */
  private _recordUsage(providerId: string, inputChars: number, outputChars: number) {
    const u = this._usage.get(providerId) || { requests: 0, inputTokensEst: 0, outputTokensEst: 0 };
    u.requests += 1;
    u.inputTokensEst += Math.ceil(inputChars / 4);
    u.outputTokensEst += Math.ceil(outputChars / 4);
    this._usage.set(providerId, u);
  }

  /** Session usage snapshot for a provider (real, locally-measured estimates). */
  getSessionUsage(providerId: string) {
    return this._usage.get(providerId) || { requests: 0, inputTokensEst: 0, outputTokensEst: 0 };
  }

  /**
   * Estimate the USD cost of a turn from real per-token prices when known.
   * Prices are $/1M tokens (input, output). Returns null when the model's
   * pricing isn't known locally — we never invent a number. OpenRouter models
   * carry live pricing on the ModelOption (pricePromptPerM/priceCompletionPerM).
   */
  estimateCost(fullModelId: string, inputTokens: number, outputTokens: number): number | null {
    const resolved = this.resolveModel(fullModelId);
    if (!resolved) return null;
    const { provider, modelId } = resolved;
    // Live OpenRouter pricing attached to the model option, if present.
    const opt = provider.models.find(m => m.id === modelId) as (ModelOption & { pricePromptPerM?: number; priceCompletionPerM?: number }) | undefined;
    if (opt && typeof opt.pricePromptPerM === "number" && typeof opt.priceCompletionPerM === "number") {
      return (inputTokens / 1e6) * opt.pricePromptPerM + (outputTokens / 1e6) * opt.priceCompletionPerM;
    }
    // Local providers and unknown pricing → no fabricated cost.
    if (provider.type === "ollama") return 0;
    return null;
  }

  /**
   * Fetch real account balance/credit/usage from a provider's API when it
   * exposes one. Returns { supported, ...fields }. Never fabricates numbers —
   * if the provider has no public balance endpoint, supported is false.
   */
  async getProviderBalance(providerId: string): Promise<{
    supported: boolean;
    message: string;
    currency?: string;
    totalCredits?: number;
    totalUsage?: number;
    remaining?: number;
    raw?: Record<string, unknown>;
  }> {
    const p = this._providers.get(providerId);
    if (!p) return { supported: false, message: "Unknown provider" };
    if (p.type === "ollama") return { supported: true, message: "Local — no billing", remaining: Infinity };
    if (!p.apiKey) return { supported: false, message: "No API key set" };

    const httpsGet = (host: string, path: string, headers: Record<string, string>) =>
      new Promise<{ code: number; body: string }>((resolve) => {
        const req = https.request(
          { hostname: forceIPv4(host), port: 443, path, method: "GET", headers, timeout: 8000 },
          (res) => {
            let body = "";
            res.on("data", (c) => { if (body.length < 8000) body += c.toString(); });
            res.on("end", () => resolve({ code: res.statusCode || 0, body }));
          }
        );
        req.on("error", () => resolve({ code: 0, body: "" }));
        req.on("timeout", () => { req.destroy(); resolve({ code: 0, body: "" }); });
        req.end();
      });

    try {
      if (p.type === "openrouter") {
        const r = await httpsGet("openrouter.ai", "/api/v1/credits", { Authorization: `Bearer ${p.apiKey}` });
        if (r.code >= 200 && r.code < 300) {
          const j = JSON.parse(r.body);
          const total = Number(j?.data?.total_credits ?? 0);
          const used = Number(j?.data?.total_usage ?? 0);
          return {
            supported: true, currency: "USD",
            totalCredits: total, totalUsage: used, remaining: total - used,
            message: `$${(total - used).toFixed(2)} of $${total.toFixed(2)} remaining`,
          };
        }
        return { supported: false, message: `Balance query failed (HTTP ${r.code})` };
      }
      if (p.type === "deepseek") {
        const r = await httpsGet("api.deepseek.com", "/user/balance", { Authorization: `Bearer ${p.apiKey}` });
        if (r.code >= 200 && r.code < 300) {
          const j = JSON.parse(r.body);
          const info = (j?.balance_infos || [])[0] || {};
          const remaining = Number(info.total_balance ?? 0);
          return {
            supported: true, currency: info.currency || "USD",
            remaining, message: `${info.currency || "USD"} ${remaining} available`,
          };
        }
        return { supported: false, message: `Balance query failed (HTTP ${r.code})` };
      }
    } catch (e) {
      return { supported: false, message: e instanceof Error ? e.message : "Balance query error" };
    }

    // Providers without a public balance endpoint — be honest, show nothing fake.
    const noApi: Record<string, string> = {
      groq: "Groq has no public balance API — check console.groq.com",
      anthropic: "Anthropic has no balance API — check console.anthropic.com",
      openai: "OpenAI billing API is restricted — check platform.openai.com/usage",
      google: "Gemini has no balance API — check aistudio.google.com",
      azure: "Azure spend is in Cost Management (needs subscription auth)",
      "azure-sora": "Azure video spend is in Cost Management (Sora/Foundry resource)",
      mistral: "Mistral has no public balance API",
      together: "Together has no public balance API",
      moonshot: "Moonshot has no public balance API",
      huggingface: "HuggingFace has no balance API",
      vultr: "Vultr billing is account-level, not via the inference key",
    };
    return { supported: false, message: noApi[p.type] || "No balance API for this provider" };
  }


  loadFromConfig(config: vscode.WorkspaceConfiguration) {
    const stored = config.get<ProviderConfig[]>("providers");
    if (stored) {
      for (const p of stored) {
        const existing = this._providers.get(p.id);
        if (existing) {
          existing.apiKey = p.apiKey || existing.apiKey;
          existing.enabled = p.enabled;
          existing.baseUrl = p.baseUrl || existing.baseUrl;
        } else {
          this._providers.set(p.id, p);
        }
      }
    }
  }

  private _secrets?: vscode.SecretStorage;

  setSecretStorage(secrets: vscode.SecretStorage) {
    this._secrets = secrets;
  }

  async loadKeysFromSecrets(secrets: vscode.SecretStorage) {
    this._secrets = secrets;
    const raw = await secrets.get("sentinel-coder.providerKeys");
    if (!raw) return;
    try {
      const keys: Record<string, string> = JSON.parse(raw);
      for (const [id, key] of Object.entries(keys)) {
        if (key) this.setProviderKey(id, key);
      }
    } catch { /* corrupt data, ignore */ }
  }

  async saveKeysToSecrets() {
    if (!this._secrets) return;
    const keys: Record<string, string> = {};
    for (const p of this._providers.values()) {
      if (p.apiKey) keys[p.id] = p.apiKey;
    }
    await this._secrets.store("sentinel-coder.providerKeys", JSON.stringify(keys));
  }

  saveToConfig(config: vscode.WorkspaceConfiguration) {
    // Save provider state (enabled/baseUrl) WITHOUT API keys
    const data = Array.from(this._providers.values()).map(p => ({
      id: p.id, name: p.name, type: p.type, baseUrl: p.baseUrl,
      enabled: p.enabled, models: p.models
    }));
    config.update("providers", data, vscode.ConfigurationTarget.Global);
    // Save keys to SecretStorage (encrypted)
    this.saveKeysToSecrets();
  }

  getProviders(): ProviderConfig[] {
    return Array.from(this._providers.values());
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this._providers.get(id);
  }

  setProviderKey(id: string, key: string) {
    const p = this._providers.get(id);
    if (p) { p.apiKey = key; p.enabled = !!key; }
  }

  setProviderEnabled(id: string, enabled: boolean) {
    const p = this._providers.get(id);
    if (p) p.enabled = enabled;
  }

  addCustomProvider(config: ProviderConfig) {
    this._providers.set(config.id, config);
  }

  removeProvider(id: string) {
    if (id !== "ollama") this._providers.delete(id);
  }

  /** Load API keys from a text file (optional bulk-import) */
  loadApiKeysFromFile(filePath: string) {
    const fs = require("fs");
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("groq:")) {
        const keys = line.split(":").slice(1).join(":").trim().split("/");
        this.setProviderKey("groq", keys[0].trim());
      } else if (lower.startsWith("openrouter:")) {
        this.setProviderKey("openrouter", line.split(":").slice(1).join(":").trim());
        } else if (lower.includes("featherless")) {
          const value = line.includes(":") ? line.split(":").slice(1).join(":").trim() : (line.includes("=") ? line.split("=").slice(1).join("=").trim() : "");
          if (value) this.setProviderKey("featherless", value);
      } else if (lower.includes("gemini")) {
        const key = line.split(":").slice(1).join(":").trim().split(" ")[0];
        if (key.startsWith("AIza")) this.setProviderKey("google", key);
      } else if (lower.includes("vultr interference") || lower.includes("vultr inference")) {
        const parts = line.split(":").slice(1).join(":").trim().split(/\s+/);
        this.setProviderKey("vultr", parts[0].trim());
      } else if (lower.includes("huggingface")) {
        const key = line.split(":").slice(1).join(":").trim();
        if (key.startsWith("hf_")) this.setProviderKey("huggingface", key);
      } else if (lower.includes("moonshot") || lower.includes("kimi")) {
        const key = line.split(":").slice(1).join(":").trim().split(/\s+/)[0];
        if (key.startsWith("sk-")) this.setProviderKey("moonshot", key);
      } else if (lower.includes("sora") && lower.includes("azure")) {
        const m = line.match(/[A-Za-z0-9]{32,}/);
        if (m) this.setProviderKey("azure-sora", m[0]);
      } else if (lower.includes("azure") && (lower.includes("key") || lower.includes("openai") || lower.includes("foundry") || lower.includes("cognitiveservices"))) {
        const m = line.match(/[A-Za-z0-9]{32,}/);
        if (m) this.setProviderKey("azure", m[0]);
      }
    }
  }

  // Get all models from all enabled providers
  async getAllModels(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];

    for (const provider of this._providers.values()) {
      if (!provider.enabled) continue;
      const liveMetadata = await this._getProviderLiveModelMetadata(provider);

      if (provider.type === "ollama") {
        try {
          const names = await this._listOllamaModels(provider);
          const OLLAMA_META: Record<string, Partial<ModelOption>> = {
            "sentinel-coder:latest": { displayName: "Sentinel Coder", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: false, supportsVision: false },
            "sentinel-coder-one:latest": { displayName: "Sentinel Coder One (14B)", contextWindow: 16384, maxOutputTokens: 2048, supportsTools: true, supportsThinking: false, supportsVision: false },
            "sentinel-coderq:latest": { displayName: "Sentinel CoderQ (14B)", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: true, supportsVision: false },
            "qwen3:14b": { displayName: "Qwen3 14B", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: true, supportsVision: false },
            "qwen3:8b": { displayName: "Qwen3 8B", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: true, supportsVision: false },
            "qwen3.5:9b": { displayName: "Qwen3.5 9B", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: true, supportsVision: false },
            "qwen2.5-coder:7b": { displayName: "Qwen2.5 Coder 7B", contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsThinking: false, supportsVision: false },
          };
          for (const name of names) {
            const meta = OLLAMA_META[name] || {};
            models.push({
              id: `ollama:${name}`,
              displayName: meta.displayName || name,
              provider: "ollama",
              providerType: "ollama",
              contextWindow: meta.contextWindow || 4096,
              maxOutputTokens: meta.maxOutputTokens || 4096,
              pricing: "local",
              pricingNote: "Local · free",
              supportsTools: meta.supportsTools ?? false,
              supportsThinking: meta.supportsThinking ?? false,
              supportsVision: meta.supportsVision ?? false,
              supportsStreaming: true,
            });
          }
        } catch { /* Ollama offline */ }
      } else if (provider.type === "openrouter") {
        // Pull OpenRouter's FULL live catalog (Opus 4.x, GPT-5.x, all Gemini/Claude, etc.).
        // Falls back to the curated static list if the network call fails.
        let live: ModelOption[] = [];
        try { live = await this._listOpenRouterModels(provider); } catch { /* offline */ }
        if (live.length > 0) {
          for (const m of live) models.push(m);
        } else {
          for (const m of provider.models) models.push(this._toModelOption(provider, m, liveMetadata));
        }
      } else if (provider.type === "azure") {
        // Azure OpenAI/Foundry uses deployment names for chat endpoints. When the live
        // deployments API succeeds, it is authoritative: if the API returns 10 chat-capable
        // deployments, the dropdown shows those 10, not a hardcoded curated overlay.
        let live: ModelOption[] = [];
        try { live = await this._listAzureDeploymentModels(provider, liveMetadata); } catch { /* offline */ }
        if (live.length > 0) {
          for (const m of live) models.push(m);
        } else {
          for (const m of provider.models) models.push(this._toModelOption(provider, m, liveMetadata));
        }
      } else if (this._canListOpenAICompatibleModels(provider)) {
        // For OpenAI-compatible providers, list all chat-capable models exposed by
        // the provider's /models API. When live discovery succeeds, curated entries are
        // fallback-only so provider dropdowns track the API catalog rather than hardcoded lists.
        const live = this._liveOptionsFromMetadata(provider, liveMetadata);
        if (live.length > 0) {
          for (const m of live) models.push(m);
        } else {
          for (const m of provider.models) models.push(this._toModelOption(provider, m, liveMetadata));
        }
      } else {
        for (const m of provider.models) models.push(this._toModelOption(provider, m, liveMetadata));
      }
    }
    return models;
  }

  // resolve "provider:model" → { provider, modelId }
  resolveModel(fullId: string): { provider: ProviderConfig; modelId: string } | null {
    const colon = fullId.indexOf(":");
    if (colon < 0) return null;
    const provId = fullId.substring(0, colon);
    const modelId = fullId.substring(colon + 1);
    // For ollama models like "ollama:sentinel-coder:latest" we need to handle the extra colon
    const prov = this._providers.get(provId);
    if (!prov) return null;
    return { provider: prov, modelId };
  }

  async *streamChat(
    fullModelId: string,
    messages: ChatMessage[],
    options: { temperature?: number; max_tokens?: number } = {},
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const resolved = this.resolveModel(fullModelId);
    if (!resolved) throw new Error(`Unknown model: ${fullModelId}`);
    const { provider, modelId } = resolved;

    if (provider.type !== "ollama" && !provider.apiKey) {
      throw new Error(`No API key configured for ${provider.name}. Set it in Settings > Models.`);
    }

    const inputChars = messages.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);
    let outputChars = 0;

    const endpoint = getChatEndpoint(provider, modelId);
    const headers = buildHeaders(provider);
    const body = buildRequestBody(provider, modelId, messages, { ...options, stream: true });

    const parsed = new URL(provider.baseUrl + endpoint.path);
    const isHttps = parsed.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const openRequest = () => new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = requestModule.request({
        hostname: forceIPv4(parsed.hostname),
        port: parsed.port || (isHttps ? "443" : "80"),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      }, resolve);
      req.setTimeout(120000, () => req.destroy(new Error("request timed out after 120s")));
      req.on("error", reject);
      if (signal) signal.addEventListener("abort", () => req.destroy(new Error("request aborted")), { once: true });
      req.write(body);
      req.end();
    });

    // Transient-error retry: rate limits, gateway/overload errors, and network
    // socket resets are retried with exponential backoff. Azure/Grok streams can
    // occasionally close a socket before sending headers; previously that escaped
    // the HTTP retry loop as "socket hang up".
    const TRANSIENT = new Set([429, 500, 502, 503, 529]);
    let response: http.IncomingMessage | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        response = await openRequest();
        if (!TRANSIENT.has(response.statusCode || 0) || attempt >= 4) break;
        const retryAfter = parseInt(String(response.headers["retry-after"] || ""), 10);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(1000 * Math.pow(2, attempt), 30000);
        response.resume(); // drain the failed body so the socket can be reused
        await delayWithAbort(waitMs, signal);
      } catch (error) {
        if (signal?.aborted) throw new Error("Request cancelled.");
        if (!isRetryableNetworkError(error) || attempt >= 4) {
          throw new Error(`${provider.name} connection failed: ${describeNetworkError(error)}`);
        }
        await delayWithAbort(Math.min(1000 * Math.pow(2, attempt), 30000), signal);
      }
    }
    if (!response) throw new Error(`${provider.name} connection failed before response headers.`);

    if (response.statusCode !== 200) {
      const chunks: Buffer[] = [];
      for await (const chunk of response) chunks.push(chunk as Buffer);
      const errBody = Buffer.concat(chunks).toString();
      const code = response.statusCode;
      const hint = code === 429
        ? " (rate limited — wait a moment, lower request frequency, or switch to another provider/model)"
        : code === 401 || code === 403
          ? " (authentication failed — check the API key in Settings › Providers)"
          : "";
      throw new Error(`${provider.name} returned ${code}${hint}: ${errBody.slice(0, 500)}`);
    }

    let buffer = "";
    for await (const chunk of response) {
      buffer += (chunk as Buffer).toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (isDone(provider, line)) { this._recordUsage(provider.id, inputChars, outputChars); return; }
        const text = parseStreamChunk(provider, line);
        if (text) { outputChars += text.length; yield text; }
      }
    }
    if (buffer.trim()) {
      const text = parseStreamChunk(provider, buffer.trim());
      if (text) { outputChars += text.length; yield text; }
    }
    this._recordUsage(provider.id, inputChars, outputChars);
  }

  /** Whether this exact provider/model/API operation supports native Chat Completions tools. */
  supportsNativeTools(fullModelId: string): boolean {
    const resolved = this.resolveModel(fullModelId);
    if (!resolved) return false;
    return this._nativeToolSupportForModel(resolved.provider, resolved.modelId);
  }

  private _nativeToolSessionKey(provider: ProviderConfig, modelId: string): string {
    return `${provider.id}:${modelId}`.toLowerCase();
  }

  private _liveMetadataForModel(provider: ProviderConfig, modelId: string): LiveModelMetadata | undefined {
    const model = provider.models.find(m => m.id === modelId);
    const cached = this._liveModelMetadataCache.get(provider.id)?.metadata;
    return cached ? this._findLiveMetadata(provider, {
      id: modelId,
      displayName: model?.displayName || modelId,
      provider: provider.id,
      contextWindow: model?.contextWindow || 0,
      pricing: model?.pricing || "pay-per-use",
      supportsTools: model?.supportsTools ?? true,
      supportsThinking: model?.supportsThinking ?? false,
      supportsVision: model?.supportsVision ?? false,
      supportsStreaming: model?.supportsStreaming ?? true,
    }, cached) : undefined;
  }

  private _nativeToolSupportForModel(provider: ProviderConfig, modelId: string): boolean {
    if (this._nativeToolsDisabledForSession.has(this._nativeToolSessionKey(provider, modelId))) return false;
    const model = provider.models.find(m => m.id === modelId);
    const live = this._liveMetadataForModel(provider, modelId);
    const params = Array.isArray(live?.supportedParameters)
      ? live.supportedParameters.map(p => String(p).toLowerCase())
      : [];
    if (params.length > 0 && !params.some(p => ["tools", "tool_choice", "function_calling", "functions", "parallel_tool_calls"].includes(p))) return false;
    if (live?.supportsTools !== undefined) return live.supportsTools;
    return defaultNativeToolSupportForChatCompletions(provider, modelId, live?.displayName || model?.displayName, model?.supportsTools);
  }

  private _supportsToolChoiceForModel(provider: ProviderConfig, modelId: string): boolean {
    if (!this._nativeToolSupportForModel(provider, modelId)) return false;
    const model = provider.models.find(m => m.id === modelId);
    const live = this._liveMetadataForModel(provider, modelId);
    const params = Array.isArray(live?.supportedParameters) ? live.supportedParameters.map(p => String(p).toLowerCase()) : [];
    if (params.length > 0) return params.includes("tool_choice");
    if (provider.type === "openrouter") return false;
    return defaultNativeToolSupportForChatCompletions(provider, modelId, model?.displayName, model?.supportsTools);
  }

  /**
   * Stream a chat completion with native OpenAI function/tool calling.
   * Yields text deltas as they arrive and a final tool_calls event when the
   * model requests tool execution. Only valid for OpenAI-compatible providers.
   */
  async *streamChatEvents(
    fullModelId: string,
    messages: ChatMessage[],
    tools: OpenAIToolSpec[],
    options: { temperature?: number; max_tokens?: number } = {},
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const resolved = this.resolveModel(fullModelId);
    if (!resolved) throw new Error(`Unknown model: ${fullModelId}`);
    const { provider, modelId } = resolved;

    if (!provider.apiKey) {
      throw new Error(`No API key configured for ${provider.name}. Set it in Settings > Models.`);
    }

    if (tools.length > 0 && !this._nativeToolSupportForModel(provider, modelId)) {
      // Correct operation selection: this model can chat, but its provider/catalog does not
      // advertise Chat Completions native tools for this exact deployment/model. Use normal
      // streaming chat rather than sending an unsupported tools operation.
      for await (const chunk of this.streamChat(fullModelId, messages, options, signal)) {
        yield { kind: "text", value: chunk };
      }
      return;
    }

    const evInputChars = messages.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);
    let evOutputChars = 0;

    const endpoint = getChatEndpoint(provider, modelId);
    const headers = buildHeaders(provider);
    const body = buildRequestBody(provider, modelId, messages, {
      ...options,
      stream: true,
      tools,
      toolChoice: this._supportsToolChoiceForModel(provider, modelId),
    });

    const parsed = new URL(provider.baseUrl + endpoint.path);
    const isHttps = parsed.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const openRequest = () => new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = requestModule.request({
        hostname: forceIPv4(parsed.hostname),
        port: parsed.port || (isHttps ? "443" : "80"),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      }, resolve);
      req.setTimeout(120000, () => req.destroy(new Error("request timed out after 120s")));
      req.on("error", reject);
      if (signal) signal.addEventListener("abort", () => req.destroy(new Error("request aborted")), { once: true });
      req.write(body);
      req.end();
    });

    // Transient-error retry: rate limits, gateway/overload errors, and network
    // socket resets are retried with exponential backoff. Azure/Grok streams can
    // occasionally close a socket before sending headers; previously that escaped
    // the HTTP retry loop as "socket hang up".
    const TRANSIENT = new Set([429, 500, 502, 503, 529]);
    let response: http.IncomingMessage | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        response = await openRequest();
        if (!TRANSIENT.has(response.statusCode || 0) || attempt >= 4) break;
        const retryAfter = parseInt(String(response.headers["retry-after"] || ""), 10);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(1000 * Math.pow(2, attempt), 30000);
        response.resume(); // drain the failed body so the socket can be reused
        await delayWithAbort(waitMs, signal);
      } catch (error) {
        if (signal?.aborted) throw new Error("Request cancelled.");
        if (!isRetryableNetworkError(error) || attempt >= 4) {
          throw new Error(`${provider.name} connection failed: ${describeNetworkError(error)}`);
        }
        await delayWithAbort(Math.min(1000 * Math.pow(2, attempt), 30000), signal);
      }
    }
    if (!response) throw new Error(`${provider.name} connection failed before response headers.`);

    if (response.statusCode !== 200) {
      const chunks: Buffer[] = [];
      for await (const chunk of response) chunks.push(chunk as Buffer);
      const errBody = Buffer.concat(chunks).toString();
      const code = response.statusCode;
      if (tools.length > 0 && isUnsupportedOperationResponse(code, errBody)) {
        // Some Azure OpenAI / AI Foundry deployments can chat normally but reject
        // the specific native-tool/streaming operation with a generic 400. Mark
        // this exact deployment/model as native-tool-disabled for the current
        // session so later turns choose the correct operation without re-triggering
        // the unsupported request, then degrade gracefully to normal chat.
        this._nativeToolsDisabledForSession.add(this._nativeToolSessionKey(provider, modelId));
        for await (const chunk of this.streamChat(fullModelId, messages, options, signal)) {
          yield { kind: "text", value: chunk };
        }
        return;
      }
      const hint = code === 429
        ? " (rate limited — wait a moment, lower request frequency, or switch to another provider/model)"
        : code === 401 || code === 403
          ? " (authentication failed — check the API key in Settings › Providers)"
          : "";
      throw new Error(`${provider.name} returned ${code}${hint}: ${errBody.slice(0, 600)}`);
    }

    // Accumulate streamed tool-call fragments by index.
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let buffer = "";

    const handleLine = (line: string): StreamEvent | null => {
      if (!line.startsWith("data: ")) return null;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return null;
      let d: any;
      try { d = JSON.parse(payload); } catch { return null; }
      const delta = d.choices?.[0]?.delta;
      if (!delta) return null;
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          const cur = toolAcc.get(idx) || { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      let text = "";
      if (delta.reasoning) text += "<think>" + delta.reasoning + "</think>";
      if (delta.content) text += delta.content;
      if (text) return { kind: "text", value: text };
      return null;
    };

    for await (const chunk of response) {
      buffer += (chunk as Buffer).toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim() === "data: [DONE]") { buffer = ""; break; }
        const ev = handleLine(line);
        if (ev) { if (ev.kind === "text") evOutputChars += ev.value.length; yield ev; }
      }
    }
    if (buffer.trim()) {
      const ev = handleLine(buffer.trim());
      if (ev) { if (ev.kind === "text") evOutputChars += ev.value.length; yield ev; }
    }

    if (toolAcc.size > 0) {
      const calls: ToolCallSpec[] = [];
      for (const [idx, v] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
        calls.push({
          id: v.id || `call_${idx}`,
          type: "function",
          function: { name: v.name, arguments: v.args || "{}" },
        });
      }
      yield { kind: "tool_calls", calls };
    }
    this._recordUsage(provider.id, evInputChars, evOutputChars);
  }

  async isAvailable(providerId: string = "ollama"): Promise<boolean> {
    const p = this._providers.get(providerId);
    if (!p) return false;
    if (p.type === "ollama") {
      try {
        const url = new URL("/api/tags", p.baseUrl);
        const parsed = new URL(url.toString());
        return new Promise((resolve) => {
          const req = http.request({
            hostname: forceIPv4(parsed.hostname),
            port: parsed.port || "80",
            path: parsed.pathname, method: "GET", timeout: 3000,
          }, (res) => resolve(res.statusCode === 200));
          req.on("error", () => resolve(false));
          req.on("timeout", () => { req.destroy(); resolve(false); });
          req.end();
        });
      } catch { return false; }
    }
    return !!p.apiKey;
  }

  /**
   * Live-verify a provider's API key by hitting a lightweight endpoint
   * (usually the models list). Returns ok + a human-readable message.
   */
  async testProvider(providerId: string): Promise<{ ok: boolean; message: string }> {
    const p = this._providers.get(providerId);
    if (!p) return { ok: false, message: "Unknown provider" };

    if (p.type === "ollama") {
      const ok = await this.isAvailable(providerId);
      return ok ? { ok: true, message: "Local server reachable" } : { ok: false, message: "Ollama not reachable" };
    }
    if (!p.apiKey) return { ok: false, message: "No API key set" };

    if (p.type === "azure-sora") {
      const parsed = new URL(p.baseUrl.replace(/\/$/, "") + "/openai/v1/videos");
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      return await new Promise((resolve) => {
        const req = lib.request({
          hostname: forceIPv4(parsed.hostname),
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: { Authorization: `Bearer ${p.apiKey}`, "User-Agent": "sentinel-coder-sora-test/1.0" },
          timeout: 10000,
        }, (res) => {
          let body = "";
          res.on("data", (c) => { if (body.length < 2000) body += c.toString(); });
          res.on("end", () => {
            const code = res.statusCode || 0;
            if (code >= 200 && code < 300) resolve({ ok: true, message: "Sora endpoint reachable (HTTP " + code + ")" });
            else if (code === 401 || code === 403) resolve({ ok: false, message: "Sora key rejected (HTTP " + code + ")" });
            else resolve({ ok: false, message: "Sora endpoint HTTP " + code + (body ? ": " + body.slice(0, 160) : "") });
          });
        });
        req.on("error", (e) => resolve({ ok: false, message: e.message || "Sora connection error" }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, message: "Sora test timed out" }); });
        req.end();
      });
    }

    // Build a lightweight GET endpoint + headers per provider type
    let path = "/v1/models";
    const headers: Record<string, string> = {};
    switch (p.type) {
      case "anthropic":
        headers["x-api-key"] = p.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        break;
      case "google":
        path = `/v1beta/models?key=${encodeURIComponent(p.apiKey)}`;
        break;
      case "groq":
        path = "/openai/v1/models";
        headers["Authorization"] = `Bearer ${p.apiKey}`;
        break;
      case "openrouter":
        path = "/api/v1/models";
        headers["Authorization"] = `Bearer ${p.apiKey}`;
        break;
      case "azure":
        path = `/openai/models?api-version=${p.apiVersion || "2024-12-01-preview"}`;
        headers["api-key"] = p.apiKey;
        break;
      default: // openai, deepseek, mistral, together, moonshot, vultr, huggingface, custom-openai
        headers["Authorization"] = `Bearer ${p.apiKey}`;
        break;
    }

    try {
      const parsed = new URL(p.baseUrl);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const basePath = parsed.pathname.replace(/\/$/, "");
      return await new Promise((resolve) => {
        const req = lib.request({
          hostname: forceIPv4(parsed.hostname),
          port: parsed.port || (isHttps ? 443 : 80),
          path: basePath + path,
          method: "GET",
          headers,
          timeout: 8000,
        }, (res) => {
          let body = "";
          res.on("data", (c) => { if (body.length < 2000) body += c.toString(); });
          res.on("end", () => {
            const code = res.statusCode || 0;
            if (code >= 200 && code < 300) {
              resolve({ ok: true, message: "Key valid (HTTP " + code + ")" });
            } else if (code === 401 || code === 403) {
              resolve({ ok: false, message: "Key rejected (HTTP " + code + ")" });
            } else {
              resolve({ ok: false, message: "HTTP " + code });
            }
          });
        });
        req.on("error", (e) => resolve({ ok: false, message: e.message || "Connection error" }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, message: "Timed out" }); });
        req.end();
      });
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Get list of all enabled model IDs */
  getEnabledModelIds(): string[] {
    const ids: string[] = [];
    for (const p of this._providers.values()) {
      if (!p.enabled) continue;
      if (p.type === "ollama") {
        // For ollama we'd need to query, so return cached if we have them
        for (const m of p.models) ids.push(`ollama:${m.id}`);
      } else {
        for (const m of p.models) ids.push(`${p.id}:${m.id}`);
      }
    }
    return ids;
  }

  /** Auto-select the best model for a given task type */
  getAutoModel(taskType: TaskType, availableModels: ModelOption[]): string {
    if (availableModels.length === 0) return "";

    let bestId = availableModels[0].id;
    let bestScore = -1;

    for (const m of availableModels) {
      const cap = MODEL_CAPABILITIES[m.id] || inferCapabilities(m);
      let score = 0;
      switch (taskType) {
        case "code-generation": score = cap.coding * 3 + cap.speed; break;
        case "code-editing": score = cap.coding * 2 + cap.reasoning + cap.speed; break;
        case "reasoning": score = cap.reasoning * 3 + cap.coding; break;
        case "explanation": score = cap.reasoning * 2 + cap.speed * 2; break;
        case "agentic": score = cap.coding + cap.reasoning * 2 + (cap.agentic ? 15 : 0); break;
        default: score = cap.coding + cap.reasoning + cap.speed; break;
      }
      if (score > bestScore) { bestScore = score; bestId = m.id; }
    }
    return bestId;
  }


  private _toModelOption(provider: ProviderConfig, model: ModelConfig, liveMetadata?: Map<string, LiveModelMetadata>): ModelOption {
    const live = this._findLiveMetadata(provider, model, liveMetadata);
    const inferred = this._inferModelLimits(model.id, model.displayName);
    const contextWindow = live?.contextWindow || inferred.contextWindow || model.contextWindow;
    const maxOutputTokens = live?.maxOutputTokens || inferred.maxOutputTokens || model.maxOutputTokens || 8192;
    const source = live?.source || (inferred.contextWindow || inferred.maxOutputTokens ? "heuristic" : "static");
    const suffix = source === "live-api" || source === "live-api+heuristic" ? " · live context" : source === "heuristic" ? " · inferred context" : "";
    return {
      id: `${provider.id}:${model.id}`,
      displayName: live?.displayName || model.displayName,
      provider: provider.id,
      providerType: provider.type,
      contextWindow,
      effectiveContextWindow: model.effectiveContextWindow,
      maxOutputTokens,
      pricing: model.pricing,
      pricingNote: `${model.pricingNote || ""}${suffix}`.trim(),
      supportsTools: live?.supportsTools ?? defaultNativeToolSupportForChatCompletions(provider, model.id, model.displayName, model.supportsTools),
      supportedParameters: live?.supportedParameters || model.supportedParameters,
      supportsThinking: live?.supportsThinking ?? model.supportsThinking,
      supportsVision: live?.supportsVision ?? model.supportsVision,
      supportsStreaming: model.supportsStreaming,
      contextSource: source,
      contextUpdatedAt: live?.updatedAt,
    };
  }

  private _findLiveMetadata(provider: ProviderConfig, model: ModelConfig, metadata?: Map<string, LiveModelMetadata>): LiveModelMetadata | undefined {
    if (!metadata || metadata.size === 0) return undefined;
    const keys = [model.id, `${provider.id}:${model.id}`, model.displayName, model.id.toLowerCase(), model.displayName.toLowerCase()];
    for (const k of keys) {
      const v = metadata.get(k);
      if (v) return v;
    }
    const wanted = model.id.toLowerCase();
    for (const [key, value] of metadata) {
      const lower = key.toLowerCase();
      if (lower === wanted || lower.endsWith(`/${wanted}`) || lower.endsWith(`:${wanted}`)) return value;
      if (value.providerModelId && value.providerModelId.toLowerCase() === wanted) return value;
    }
    return undefined;
  }

  private _canListOpenAICompatibleModels(provider: ProviderConfig): boolean {
    return new Set(["openai", "groq", "deepseek", "mistral", "together", "vultr", "huggingface", "featherless", "moonshot", "custom-openai"]).has(provider.type);
  }

  private _isChatCapableModelName(id: string, displayName?: string): boolean {
    const s = `${id} ${displayName || ""}`.toLowerCase();
    // Exclude known non-chat deployments so chat/Agentic dropdown entries are expected to work.
    // Media, embedding, moderation, audio, speech, and video deployments should be exposed by
    // dedicated media/tool selectors instead of the chat completion selector.
    if (/embedding|embed|text-embedding|rerank|whisper|tts|speech|audio|image|dall|sora|video|moderation|babbage|davinci-002/.test(s)) return false;
    // Include known chat/reasoning/code families. Unknown OpenAI-compatible names
    // are kept only for custom providers where the endpoint usually returns chat models.
    if (/gpt|grok|claude|gemini|llama|qwen|mistral|mixtral|deepseek|kimi|moonshot|codex|codestral|command|cohere|phi|nemotron|glm|yi|minimax|doubao|ernie|hunyuan|o[1-9]/.test(s)) return true;
    return false;
  }

  private _liveOptionsFromMetadata(provider: ProviderConfig, metadata?: Map<string, LiveModelMetadata>): ModelOption[] {
    if (!metadata || metadata.size === 0) return [];
    const byId = new Map<string, LiveModelMetadata>();
    for (const meta of metadata.values()) {
      if (!meta.id || byId.has(meta.id)) continue;
      const knownChatName = this._isChatCapableModelName(meta.id, meta.displayName);
      // Custom OpenAI-compatible endpoints often expose only chat models but use private
      // names that our family heuristics cannot know yet. For first-party/known providers
      // we stay stricter to avoid putting embeddings/image/video models in chat selectors.
      if (!knownChatName && provider.type !== "custom-openai") continue;
      byId.set(meta.id, meta);
    }
    return Array.from(byId.values()).map(meta => this._modelOptionFromLiveMetadata(provider, meta));
  }

  private _modelOptionFromLiveMetadata(provider: ProviderConfig, meta: LiveModelMetadata, deploymentId?: string): ModelOption {
    const id = deploymentId || meta.id;
    const inferred = this._inferModelLimits(id, meta.displayName || meta.providerModelId);
    const contextWindow = meta.contextWindow || inferred.contextWindow || 128000;
    const maxOutputTokens = meta.maxOutputTokens || inferred.maxOutputTokens || 8192;
    const source = meta.source || (inferred.contextWindow || inferred.maxOutputTokens ? "heuristic" : "static");
    const sourceLabel = source === "live-api" || source === "live-api+heuristic" ? "live API" : "inferred";
    const pricing = provider.models[0]?.pricing || (provider.type === "azure" ? "subscription" : "pay-per-use");
    const pricingNote = provider.type === "azure" ? `Azure credits - ${sourceLabel} model/deployment metadata` : `${sourceLabel} model metadata`;
    return {
      id: `${provider.id}:${id}`,
      displayName: `${provider.name}: ${meta.displayName || id}`,
      provider: provider.id,
      providerType: provider.type,
      contextWindow,
      maxOutputTokens,
      pricing,
      pricingNote,
      supportsTools: meta.supportsTools ?? defaultNativeToolSupportForChatCompletions(provider, id, meta.displayName),
      supportedParameters: meta.supportedParameters,
      supportsThinking: meta.supportsThinking ?? /reason|gpt[-_ ]?5|grok|o[1-9]|deepseek|qwen|kimi/i.test(`${id} ${meta.displayName || ""}`),
      supportsVision: meta.supportsVision ?? /gpt[-_ ]?4\.1|gpt[-_ ]?5|gemini|claude|vision|4o/i.test(`${id} ${meta.displayName || ""}`),
      supportsStreaming: true,
      contextSource: source,
      contextUpdatedAt: meta.updatedAt,
    };
  }

  private async _listAzureDeploymentModels(provider: ProviderConfig, liveMetadata?: Map<string, LiveModelMetadata>): Promise<ModelOption[]> {
    if (!provider.apiKey) return [];
    const apiVersion = provider.apiVersion || "2024-12-01-preview";
    const endpoint = { url: new URL(`/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`, provider.baseUrl), headers: buildHeaders(provider) };
    const raw = await this._requestJson(endpoint.url, endpoint.headers, 8000);
    const items = Array.isArray((raw as any)?.data) ? (raw as any).data : Array.isArray(raw) ? raw : [];
    const now = Date.now();
    const out: ModelOption[] = [];
    const seen = new Set<string>();
    for (const item of items as any[]) {
      const deploymentId = String(item?.id || item?.name || item?.deploymentName || "").trim();
      if (!deploymentId || seen.has(deploymentId.toLowerCase())) continue;
      const modelName = String(item?.model || item?.modelName || item?.model_name || item?.properties?.model?.name || item?.properties?.model?.format || deploymentId).trim();
      const displayName = `${deploymentId}${modelName && modelName !== deploymentId ? ` (${modelName})` : ""}`;
      const capabilities = item?.capabilities || item?.properties?.capabilities || {};
      const hasCapability = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;
      const apiSaysChat = hasCapability(capabilities.chat_completion) || hasCapability(capabilities.chatCompletions) || hasCapability(capabilities.chat);
      const nameLooksChat = this._isChatCapableModelName(deploymentId, modelName);
      // Trust the provider's explicit chat capability when present. Name heuristics are fallback only,
      // because Azure/Foundry deployments may be named "production", "model-router", or other custom IDs.
      if (!apiSaysChat && !nameLooksChat) continue;
      const existing = liveMetadata ? this._findLiveMetadata(provider, { id: deploymentId, displayName, provider: provider.id, contextWindow: 0, pricing: "subscription", supportsTools: true, supportsThinking: false, supportsVision: false, supportsStreaming: true }, liveMetadata) : undefined;
      const inferred = this._inferModelLimits(deploymentId, modelName || displayName);
      const explicitTools = capabilityRecordSaysTools(capabilities) ?? capabilityRecordSaysTools(item);
      const meta: LiveModelMetadata = {
        id: deploymentId,
        displayName: existing?.displayName || displayName,
        providerModelId: existing?.providerModelId || (modelName && modelName !== deploymentId ? modelName : undefined),
        contextWindow: existing?.contextWindow || inferred.contextWindow,
        maxOutputTokens: existing?.maxOutputTokens || inferred.maxOutputTokens,
        supportsTools: existing?.supportsTools ?? explicitTools ?? defaultNativeToolSupportForChatCompletions(provider, deploymentId, modelName || displayName),
        supportsThinking: existing?.supportsThinking ?? /reason|gpt[-_ ]?5|grok|o[1-9]|deepseek|qwen|kimi/i.test(`${deploymentId} ${modelName}`),
        supportsVision: existing?.supportsVision ?? /gpt[-_ ]?4\.1|gpt[-_ ]?5|vision|4o|gemini|claude/i.test(`${deploymentId} ${modelName}`),
        source: existing?.source || "live-api+heuristic",
        updatedAt: now,
      };
      out.push(this._modelOptionFromLiveMetadata(provider, meta, deploymentId));
      seen.add(deploymentId.toLowerCase());
    }
    return out;
  }

  private async _getProviderLiveModelMetadata(provider: ProviderConfig): Promise<Map<string, LiveModelMetadata>> {
    const now = Date.now();
    const cached = this._liveModelMetadataCache.get(provider.id);
    if (cached && cached.expiresAt > now) return cached.metadata;
    const metadata = new Map<string, LiveModelMetadata>();
    if (provider.type === "ollama" || provider.type === "azure-sora") {
      this._liveModelMetadataCache.set(provider.id, { expiresAt: now + 10 * 60_000, metadata });
      return metadata;
    }

    const endpoint = this._modelMetadataEndpoint(provider);
    if (endpoint && (provider.apiKey || provider.type === "openrouter")) {
      try {
        const raw = await this._requestJson(endpoint.url, endpoint.headers, 8000);
        const items = Array.isArray((raw as any)?.data) ? (raw as any).data : Array.isArray(raw) ? raw : [];
        for (const item of items as OpenRouterApiModel[]) {
          const meta = this._metadataFromLiveEntry(item, now);
          if (!meta) continue;
          metadata.set(meta.id, meta);
          metadata.set(meta.id.toLowerCase(), meta);
          if (meta.providerModelId) metadata.set(meta.providerModelId.toLowerCase(), meta);
          if (meta.displayName) metadata.set(meta.displayName.toLowerCase(), meta);
        }
      } catch {
        // Offline, unauthorized, or provider lacks /models metadata. Fall through to honest heuristics.
      }
    }

    for (const m of provider.models) {
      if (this._findLiveMetadata(provider, m, metadata)) continue;
      const inferred = this._inferModelLimits(m.id, m.displayName);
      if (inferred.contextWindow || inferred.maxOutputTokens) {
        const meta: LiveModelMetadata = {
          id: m.id, displayName: m.displayName, contextWindow: inferred.contextWindow, maxOutputTokens: inferred.maxOutputTokens,
          supportsTools: defaultNativeToolSupportForChatCompletions(provider, m.id, m.displayName, m.supportsTools), supportsThinking: m.supportsThinking, supportsVision: m.supportsVision, source: "heuristic", updatedAt: now,
        };
        metadata.set(m.id, meta);
        metadata.set(m.id.toLowerCase(), meta);
        metadata.set(m.displayName.toLowerCase(), meta);
      }
    }

    this._liveModelMetadataCache.set(provider.id, { expiresAt: now + 10 * 60_000, metadata });
    return metadata;
  }

  private _modelMetadataEndpoint(provider: ProviderConfig): { url: URL; headers: Record<string, string> } | null {
    try {
      const headers = buildHeaders(provider);
      if (provider.type === "openrouter") return { url: new URL("/api/v1/models", provider.baseUrl), headers };
      if (provider.type === "azure") {
        const apiVersion = provider.apiVersion || "2024-12-01-preview";
        return { url: new URL(`/openai/models?api-version=${encodeURIComponent(apiVersion)}`, provider.baseUrl), headers };
      }
      const openAICompatible = new Set(["openai", "groq", "deepseek", "mistral", "together", "vultr", "huggingface", "featherless", "moonshot", "custom-openai"]);
      if (openAICompatible.has(provider.type)) return { url: new URL("/v1/models", provider.baseUrl), headers };
    } catch { return null; }
    return null;
  }

  private _requestJson(url: URL, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request({
        hostname: forceIPv4(url.hostname), port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search, method: "GET", headers, timeout: timeoutMs,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => { if (Buffer.concat(chunks).length < 2_000_000) chunks.push(c as Buffer); });
        res.on("end", () => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); } catch (e) { reject(e); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.end();
    });
  }

  private _metadataFromLiveEntry(entry: OpenRouterApiModel, now: number): LiveModelMetadata | null {
    if (!entry || !entry.id) return null;
    const ctx = this._firstPositiveNumber([
      entry.context_length, entry.context_window, entry.context_window_tokens, entry.max_context_length,
      entry.max_input_tokens, entry.input_token_limit, entry.top_provider?.context_length, entry.top_provider?.max_tokens, entry.max_tokens,
    ]);
    const out = this._firstPositiveNumber([
      entry.top_provider?.max_completion_tokens, entry.max_completion_tokens, entry.max_output_tokens, entry.output_token_limit,
    ]);
    const inferred = this._inferModelLimits(entry.id, entry.name || entry.display_name || entry.model || entry.id);
    const params = Array.isArray(entry.supported_parameters) ? entry.supported_parameters.map(p => String(p).toLowerCase()) : [];
    const explicitTools = liveEntrySaysTools(entry);
    const inMods = entry.architecture && Array.isArray(entry.architecture.input_modalities) ? entry.architecture.input_modalities : [];
    const outMods = entry.architecture && Array.isArray(entry.architecture.output_modalities) ? entry.architecture.output_modalities : [];
    const modalityText = `${entry.architecture?.modality || ""} ${inMods.join(" ")} ${outMods.join(" ")}`.toLowerCase();
    if (/embedding|image|video|audio|speech|moderation/.test(modalityText)) return null;
    const source = ctx || out ? (inferred.contextWindow || inferred.maxOutputTokens ? "live-api+heuristic" : "live-api") : "heuristic";
    return {
      id: entry.id,
      displayName: entry.name || entry.display_name || entry.id,
      providerModelId: entry.model,
      contextWindow: ctx || inferred.contextWindow,
      maxOutputTokens: out || inferred.maxOutputTokens,
      supportedParameters: params.length > 0 ? params : undefined,
      supportsTools: explicitTools,
      supportsThinking: params.includes("reasoning") || params.includes("include_reasoning") || undefined,
      supportsVision: inMods.includes("image") || undefined,
      source,
      updatedAt: now,
    };
  }

  private _firstPositiveNumber(values: Array<unknown>): number | undefined {
    for (const value of values) {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return undefined;
  }

  private _inferModelLimits(id: string, displayName?: string): { contextWindow?: number; maxOutputTokens?: number } {
    const name = `${id} ${displayName || ""}`.toLowerCase();
    if (/gpt[-_ ]?5\.5|gpt[-_ ]?5\.4|gpt[-_ ]?5(?![-_ ]?mini)|gpt[-_ ]?4\.1/.test(name)) return { contextWindow: 1_048_576, maxOutputTokens: /5\.4(?!-pro)/.test(name) ? 65_536 : 128_000 };
    if (/gemini[-_ ]?2\.?5|gemini[-_ ]?2\.?0/.test(name)) return { contextWindow: 1_048_576, maxOutputTokens: 65_536 };
    if (/claude.*(opus|sonnet).*4/.test(name)) return { contextWindow: 200_000, maxOutputTokens: 32_768 };
    if (/grok[-_ ]?4\.3/.test(name)) return { contextWindow: 322_000, maxOutputTokens: 32_768 };
    if (/grok[-_ ]?4\.2|grok[-_ ]?4/.test(name)) return { contextWindow: 256_000, maxOutputTokens: 32_768 };
    if (/llama[-_ ]?4|qwen3[-_ ]?coder|kimi[-_ ]?k2|glm[-_ ]?5/.test(name)) return { contextWindow: 128_000, maxOutputTokens: 16_384 };
    if (/gpt[-_ ]?oss[-_ ]?120b|llama[-_ ]?3\.3/.test(name)) return { contextWindow: 128_000, maxOutputTokens: 8_192 };
    return {};
  }

  private async _listOllamaModels(provider: ProviderConfig): Promise<string[]> {
    const parsed = new URL("/api/tags", provider.baseUrl);
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: forceIPv4(parsed.hostname),
        port: parsed.port || "80",
        path: parsed.pathname, method: "GET", timeout: 5000,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            resolve((body.models || []).map((m: { name: string }) => m.name));
          } catch { resolve([]); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.end();
    });
  }

  /**
   * Fetch the full live OpenRouter model catalog (hundreds of models incl. the
   * latest Claude Opus/Sonnet, GPT-5.x, Gemini, etc.) and map it to ModelOptions.
   */
  private async _listOpenRouterModels(provider: ProviderConfig): Promise<ModelOption[]> {
    const raw: OpenRouterApiModel[] = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "openrouter.ai",
        path: "/api/v1/models",
        method: "GET",
        timeout: 8000,
        headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve((JSON.parse(Buffer.concat(chunks).toString()).data || []) as OpenRouterApiModel[]); }
          catch { resolve([]); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.end();
    });

    const out: ModelOption[] = [];
    for (const m of raw) {
      if (!m || !m.id) continue;
      const params: string[] = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
      const inMods: string[] = (m.architecture && Array.isArray(m.architecture.input_modalities)) ? m.architecture.input_modalities : [];
      const promptPrice = m.pricing ? parseFloat(m.pricing.prompt || "0") : 0;
      const perMillion = promptPrice > 0 ? `$${(promptPrice * 1_000_000).toFixed(2)}/M in` : "pay-per-use";
      const isFree = /:free$/.test(m.id) || promptPrice === 0;
      out.push({
        id: `${provider.id}:${m.id}`,
        displayName: m.name || m.id,
        provider: provider.id,
        providerType: provider.type,
        contextWindow: m.context_length || this._inferModelLimits(m.id, m.name || m.id).contextWindow || 8192,
        maxOutputTokens: (m.top_provider && m.top_provider.max_completion_tokens) || this._inferModelLimits(m.id, m.name || m.id).maxOutputTokens || 8192,
        pricing: isFree ? "free" : "pay-per-use",
        pricingNote: isFree ? "Free via OpenRouter" : `${perMillion} via OpenRouter`,
        supportsTools: params.includes("tools") || params.includes("tool_choice"),
        supportsThinking: params.includes("reasoning") || params.includes("include_reasoning"),
        supportsVision: inMods.includes("image"),
        supportsStreaming: true,
        contextSource: m.context_length ? "live-api" : (this._inferModelLimits(m.id, m.name || m.id).contextWindow ? "heuristic" : "static"),
        contextUpdatedAt: Date.now(),
      });
    }
    // Frontier models on top (matches the marketplace description), then the
    // rest of the live catalog alphabetically.
    out.sort((a, b) => {
      const ra = frontierRank(a.displayName, a.id);
      const rb = frontierRank(b.displayName, b.id);
      if (ra !== rb) return ra - rb;
      return a.displayName.localeCompare(b.displayName);
    });
    return out;
  }
}

// ── Task Classification & Auto-Router ─────────────────────────────

export type TaskType = "code-generation" | "code-editing" | "reasoning" | "explanation" | "agentic" | "general";

export interface ModelCapability {
  coding: number;      // 1-10
  reasoning: number;   // 1-10
  speed: number;       // 1-10
  agentic: boolean;    // can use tools
  thinking: boolean;   // has thinking/reasoning mode
}

/** Known model capabilities — keyed by "provider:modelId" */
const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // ── Cloud Tier 1 (Premium) ──
  "anthropic:claude-opus-4-20250514":   { coding: 10, reasoning: 10, speed: 3, agentic: true, thinking: true },
  "anthropic:claude-sonnet-4-20250514": { coding: 9, reasoning: 9, speed: 6, agentic: true, thinking: true },
  "anthropic:claude-3-5-haiku-20241022":{ coding: 7, reasoning: 6, speed: 9, agentic: true, thinking: false },
  "openai:o3":                          { coding: 9, reasoning: 10, speed: 4, agentic: true, thinking: true },
  "openai:o3-mini":                     { coding: 8, reasoning: 9, speed: 6, agentic: true, thinking: true },
  "openai:o4-mini":                     { coding: 8, reasoning: 9, speed: 7, agentic: true, thinking: true },
  "openai:gpt-4o":                      { coding: 9, reasoning: 8, speed: 7, agentic: true, thinking: false },
  "openai:gpt-4o-mini":                 { coding: 7, reasoning: 6, speed: 9, agentic: true, thinking: false },
  "openai:gpt-4.1":                     { coding: 9, reasoning: 8, speed: 6, agentic: true, thinking: false },
  "openai:gpt-4.1-mini":               { coding: 8, reasoning: 7, speed: 8, agentic: true, thinking: false },
  "openai:gpt-4.1-nano":               { coding: 6, reasoning: 5, speed: 10, agentic: true, thinking: false },
  "openai:codex-mini":                  { coding: 9, reasoning: 7, speed: 8, agentic: true, thinking: false },
  "google:gemini-2.5-pro":             { coding: 9, reasoning: 9, speed: 5, agentic: true, thinking: true },
  "google:gemini-2.5-flash":           { coding: 8, reasoning: 7, speed: 9, agentic: true, thinking: true },
  "google:gemini-2.0-flash":           { coding: 7, reasoning: 6, speed: 9, agentic: true, thinking: false },

  // ── Cloud Tier 2 (via Groq / OpenRouter) ──
  // Speed/agentic ratings below are anchored to a real streaming benchmark
  // (scripts/perf/modelPerf.mjs, Groq): measured tok/s, TTFT jitter, and a
  // 3/3 native tool-calling pass for every model listed here.
  "featherless:Qwen/Qwen3-Coder-480B-A35B-Instruct": { coding: 8, reasoning: 7, speed: 6, agentic: false, thinking: false },
  "featherless:meta-llama/Llama-3.3-70B-Instruct": { coding: 6, reasoning: 7, speed: 6, agentic: false, thinking: false },
  "featherless:meta-llama/Meta-Llama-3.1-8B-Instruct": { coding: 5, reasoning: 5, speed: 7, agentic: false, thinking: false },
  "groq:llama-3.3-70b-versatile":      { coding: 7, reasoning: 7, speed: 10, agentic: true, thinking: false },
  "groq:llama-3.1-8b-instant":         { coding: 5, reasoning: 4, speed: 10, agentic: false, thinking: false },
  "groq:meta-llama/llama-4-scout-17b-16e-instruct": { coding: 7, reasoning: 7, speed: 10, agentic: true, thinking: false },
  "groq:qwen/qwen3-32b":               { coding: 8, reasoning: 8, speed: 9, agentic: true, thinking: true },
  "groq:openai/gpt-oss-120b":          { coding: 8, reasoning: 8, speed: 9, agentic: true, thinking: true },
  "groq:openai/gpt-oss-20b":           { coding: 6, reasoning: 7, speed: 10, agentic: true, thinking: true },
  "groq:groq/compound":                { coding: 7, reasoning: 8, speed: 7, agentic: true, thinking: true },
  "openrouter:openrouter/free":        { coding: 6, reasoning: 6, speed: 6, agentic: true, thinking: false },
  "openrouter:qwen/qwen3-coder:free":  { coding: 9, reasoning: 8, speed: 5, agentic: true, thinking: true },
  "openrouter:qwen/qwen3-next-80b-a3b-instruct:free": { coding: 8, reasoning: 8, speed: 5, agentic: true, thinking: true },
  "openrouter:meta-llama/llama-3.3-70b-instruct:free": { coding: 7, reasoning: 7, speed: 6, agentic: true, thinking: false },
  "openrouter:meta-llama/llama-3.2-3b-instruct:free": { coding: 4, reasoning: 4, speed: 8, agentic: false, thinking: false },
  "openrouter:liquid/lfm-2.5-1.2b-instruct:free": { coding: 4, reasoning: 4, speed: 8, agentic: false, thinking: false },
  "openrouter:mistralai/mistral-small-3.2-24b-instruct:free": { coding: 6, reasoning: 6, speed: 6, agentic: true, thinking: false },
  "openrouter:google/gemini-2.5-flash": { coding: 8, reasoning: 7, speed: 6, agentic: true, thinking: true },
  "openrouter:google/gemini-2.5-pro":   { coding: 9, reasoning: 9, speed: 4, agentic: true, thinking: true },
  "groq:groq/compound-mini":           { coding: 6, reasoning: 6, speed: 9, agentic: true, thinking: true },

  "deepseek:deepseek-chat":            { coding: 8, reasoning: 7, speed: 6, agentic: true, thinking: false },
  "deepseek:deepseek-reasoner":        { coding: 8, reasoning: 9, speed: 4, agentic: true, thinking: true },

  "mistral:mistral-large-latest":      { coding: 8, reasoning: 7, speed: 6, agentic: true, thinking: false },
  "mistral:codestral-latest":          { coding: 9, reasoning: 6, speed: 7, agentic: true, thinking: false },

  // ── Local (Ollama) ──
  "ollama:sentinel-coderq:latest":     { coding: 7, reasoning: 7, speed: 8, agentic: true, thinking: true },
  "ollama:sentinel-coder-one:latest":  { coding: 7, reasoning: 6, speed: 7, agentic: true, thinking: false },
  "ollama:sentinel-coder:latest":      { coding: 6, reasoning: 5, speed: 9, agentic: true, thinking: false },
  "ollama:qwen3:14b":                  { coding: 7, reasoning: 7, speed: 7, agentic: true, thinking: true },
  "ollama:qwen3:8b":                   { coding: 6, reasoning: 6, speed: 8, agentic: true, thinking: true },
  "ollama:qwen2.5-coder:7b":           { coding: 6, reasoning: 4, speed: 8, agentic: true, thinking: false },

  // ── Vultr Inference ──
  "vultr:Qwen/Qwen2.5-Coder-32B-Instruct": { coding: 8, reasoning: 6, speed: 7, agentic: true, thinking: false },
  "vultr:nvidia/DeepSeek-V3.2-NVFP4":      { coding: 9, reasoning: 8, speed: 6, agentic: true, thinking: false },
  "vultr:openai/gpt-oss-120b":             { coding: 8, reasoning: 8, speed: 5, agentic: true, thinking: false },
  "vultr:MiniMaxAI/MiniMax-M2.5":          { coding: 7, reasoning: 8, speed: 5, agentic: true, thinking: true },
  "vultr:moonshotai/Kimi-K2.5":            { coding: 7, reasoning: 8, speed: 5, agentic: true, thinking: true },
  "vultr:zai-org/GLM-5-FP8":               { coding: 7, reasoning: 7, speed: 6, agentic: true, thinking: true },
  "vultr:zai-org/GLM-5.1-FP8":             { coding: 7, reasoning: 8, speed: 6, agentic: true, thinking: true },

  // ── Azure OpenAI / AI Foundry (your deployments — Azure credits) ──
  "azure:gpt-5.5":                          { coding: 10, reasoning: 10, speed: 4, agentic: true, thinking: true },
  "azure:gpt-5.4-pro":                      { coding: 10, reasoning: 10, speed: 4, agentic: true, thinking: true },
  "azure:gpt-5.4":                          { coding: 9, reasoning: 9, speed: 5, agentic: true, thinking: true },
  "azure:grok-4.3":                        { coding: 10, reasoning: 10, speed: 6, agentic: true, thinking: true },
  "azure:gpt-4.1":                         { coding: 9, reasoning: 8, speed: 6, agentic: true, thinking: false },
  "azure:model-router":                    { coding: 9, reasoning: 9, speed: 6, agentic: true, thinking: true },
  "azure:gpt-chat-latest":                 { coding: 8, reasoning: 7, speed: 7, agentic: true, thinking: false },

  // ── Moonshot (Kimi) ──
  "moonshot:kimi-latest":                  { coding: 9, reasoning: 9, speed: 5, agentic: true, thinking: true },
  "moonshot:kimi-k2-0905-preview":         { coding: 9, reasoning: 8, speed: 5, agentic: true, thinking: false },
  "moonshot:kimi-thinking-preview":        { coding: 8, reasoning: 9, speed: 4, agentic: true, thinking: true },
};

/** Infer capabilities for unknown models based on name heuristics */
function inferCapabilities(model: ModelOption): ModelCapability {
  const name = (model.displayName + " " + model.id).toLowerCase();
  const base: ModelCapability = { coding: 5, reasoning: 5, speed: 5, agentic: true, thinking: false };

  if (name.includes("coder") || name.includes("codex") || name.includes("codestral")) base.coding += 3;
  if (name.includes("opus") || name.includes("large") || name.includes("405b") || name.includes("235b")) { base.coding += 2; base.reasoning += 3; base.speed -= 2; }
  if (name.includes("mini") || name.includes("small") || name.includes("nano") || name.includes("8b") || name.includes("7b")) { base.speed += 3; base.reasoning -= 1; }
  if (name.includes("flash") || name.includes("instant") || name.includes("turbo")) base.speed += 3;
  if (name.includes("r1") || name.includes("reasoner") || name.includes("qwq") || name.includes("o3") || name.includes("o4")) { base.reasoning += 3; base.thinking = true; }
  if (name.includes("70b") || name.includes("72b") || name.includes("32b")) { base.coding += 1; base.reasoning += 1; }

  // Clamp values
  for (const key of ["coding", "reasoning", "speed"] as const) base[key] = Math.max(1, Math.min(10, base[key]));
  return base;
}

export function classifyTask(message: string): TaskType {
  const lower = message.toLowerCase();
  const agenticKeywords = /\b(run|execute|install|deploy|test|check|search|scan|read\s+file|list\s+dir|find\s+file|git\s+status|terminal|npm|pip|docker)\b/;
  const codeKeywords = /\b(write|create|build|implement|generate|make|code|function|class|component|api|endpoint|page|app|script|module|html|css|react|vue|python)\b/;
  const editKeywords = /\b(fix|debug|error|refactor|optimize|improve|update|change|modify|bug|issue|lint|patch|correct)\b/;
  const reasonKeywords = /\b(think|analyze|compare|design|plan|architect|evaluate|trade.?off|pros.?cons|strategy|which\s+is\s+better)\b/;
  const explainKeywords = /\b(explain|what\s+is|how\s+does|why\s+does|describe|understand|tell\s+me\s+about|difference\s+between|overview)\b/;

  // Agentic tasks need tool use
  if (agenticKeywords.test(lower)) return "agentic";
  // Reasoning tasks
  if (reasonKeywords.test(lower)) return "reasoning";
  // Code editing
  if (editKeywords.test(lower)) return "code-editing";
  // Code generation
  if (codeKeywords.test(lower)) return "code-generation";
  // Explanation
  if (explainKeywords.test(lower)) return "explanation";
  return "general";
}

export function getModelCapability(modelId: string): ModelCapability {
  return MODEL_CAPABILITIES[modelId] || { coding: 5, reasoning: 5, speed: 5, agentic: true, thinking: false };
}
