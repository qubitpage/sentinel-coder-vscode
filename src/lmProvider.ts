import * as vscode from "vscode";
import { MultiProviderClient, ChatMessage, ModelOption } from "./providers";

/**
 * Exposes the Sentinel Coder multi-provider models (Azure Grok-4.3, GPT-4.1,
 * Kimi/Moonshot, local QubGPU, Ollama, etc.) inside VS Code's native chat model
 * picker via the finalized LanguageModelChatProvider API.
 *
 * Models appear under the "sentinel-coder" vendor and can be selected in the
 * Copilot Chat model dropdown. API keys are read from the MultiProviderClient
 * (SecretStorage / apiKeysFile) — never bundled.
 */
export class SentinelLanguageModelProvider implements vscode.LanguageModelChatProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;

  constructor(
    private readonly _client: MultiProviderClient,
    private readonly _output: vscode.OutputChannel
  ) {}

  /** Notify VS Code that the available model set may have changed (e.g. a key was added). */
  refresh(): void {
    this._onDidChange.fire();
  }

  async provideLanguageModelChatInformation(
    _options: { silent: boolean },
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    try {
      // VS Code calls this while opening the native Chat model picker. Keep this
      // bounded so model discovery cannot stall Sentinel startup/chat rendering.
      const liveModels = await this._withTimeout(this._client.getAllModels(), 2500, token);
      const infos = this._toLanguageModelInfo(liveModels);
      this._output.appendLine(`LM provider: advertising ${infos.length} Sentinel model(s) to VS Code chat picker`);
      return infos;
    } catch (err) {
      this._output.appendLine("LM provider: live model listing failed; advertising no native chat models - " + String(err));
      return [];
    }
  }

  private _toLanguageModelInfo(models: ModelOption[]): vscode.LanguageModelChatInformation[] {
    return models.map((m) => {
      const isAzureGrok = m.id === "azure:grok-4.3";
      const detailBits: string[] = [];
      if (m.provider) detailBits.push(m.provider);
      if (m.pricingNote) detailBits.push(m.pricingNote);
      if (m.contextSource) detailBits.push(m.contextSource);
      return {
        id: m.id,
        name: isAzureGrok ? `${m.displayName} (Azure)` : m.displayName,
        family: m.provider || m.providerType || "sentinel",
        version: "1",
        maxInputTokens: (m.effectiveContextWindow || m.contextWindow) > 0 ? (m.effectiveContextWindow || m.contextWindow) : 128000,
        maxOutputTokens: m.maxOutputTokens > 0 ? m.maxOutputTokens : 8192,
        tooltip: `${m.displayName} - ${m.provider || m.providerType || "provider"} (${m.pricing || "pricing unavailable"})`,
        detail: detailBits.join(" - "),
        capabilities: {
          imageInput: !!m.supportsVision,
          toolCalling: !!m.supportsTools,
        },
      } as vscode.LanguageModelChatInformation;
    });
  }

  private _mergeModelOptions(primary: ModelOption[], fallback: ModelOption[]): ModelOption[] {
    const merged: ModelOption[] = [];
    const seen = new Set<string>();
    for (const model of [...primary, ...fallback]) {
      if (!model?.id || seen.has(model.id)) continue;
      seen.add(model.id);
      merged.push(model);
    }
    return merged;
  }

  private async _withTimeout<T>(promise: Promise<T>, timeoutMs: number, token: vscode.CancellationToken): Promise<T> {
    if (token.isCancellationRequested) throw new Error("cancelled");
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const chatMessages: ChatMessage[] = [];
    for (const msg of messages) {
      const role: ChatMessage["role"] =
        msg.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user";
      const text = this._extractText(msg.content);
      if (text.trim()) chatMessages.push({ role, content: text });
    }
    if (chatMessages.length === 0) {
      chatMessages.push({ role: "user", content: "" });
    }

    const modelOptions = (options.modelOptions || {}) as Record<string, unknown>;
    const temperature = typeof modelOptions.temperature === "number" ? modelOptions.temperature : 0.7;
    const maxTokens = typeof modelOptions.max_tokens === "number" ? modelOptions.max_tokens : model.maxOutputTokens;

    const abort = new AbortController();
    token.onCancellationRequested(() => abort.abort());

    try {
      for await (const chunk of this._client.streamChat(
        model.id,
        chatMessages,
        { temperature, max_tokens: maxTokens },
        abort.signal
      )) {
        if (token.isCancellationRequested) break;
        if (chunk) progress.report(new vscode.LanguageModelTextPart(chunk));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._output.appendLine(`LM provider: response error (${model.id}) — ${msg}`);
      throw new Error(msg);
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const str = typeof text === "string" ? text : this._extractText(text.content);
    // Rough heuristic: ~4 chars per token.
    return Math.max(1, Math.ceil(str.length / 4));
  }

  private _extractText(content: ReadonlyArray<unknown>): string {
    const parts: string[] = [];
    for (const part of content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        parts.push(part.value);
      } else if (typeof part === "string") {
        parts.push(part);
      } else if (part && typeof (part as { value?: unknown }).value === "string") {
        parts.push((part as { value: string }).value);
      }
    }
    return parts.join("");
  }
}
