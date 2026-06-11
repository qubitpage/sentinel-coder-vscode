import * as http from "http";
import * as https from "https";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

/** Force localhost to 127.0.0.1 to avoid IPv6 ::1 resolution issues */
function forceIPv4(hostname: string): string {
  return hostname === "localhost" ? "127.0.0.1" : hostname;
}

export class OllamaClient {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  getModel(): string {
    return this.model;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setModel(model: string) {
    this.model = model;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  private _reqOpts(parsedUrl: URL, method: string, extra: Record<string, unknown> = {}): http.RequestOptions {
    return {
      hostname: forceIPv4(parsedUrl.hostname),
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname,
      method,
      timeout: 10000,
      ...extra,
    };
  }

  private _module(parsedUrl: URL) {
    return parsedUrl.protocol === "https:" ? https : http;
  }

  async *streamChat(
    messages: OllamaMessage[],
    options: { temperature?: number; num_predict?: number; model?: string } = {},
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const parsed = new URL("/api/chat", this.baseUrl);
    const body = JSON.stringify({
      model: options.model || this.model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.num_predict ?? 2048,
      },
    });

    const response = await new Promise<http.IncomingMessage>(
      (resolve, reject) => {
        const req = this._module(parsed).request(
          this._reqOpts(parsed, "POST", {
            timeout: 0, // no timeout for streaming
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          }),
          resolve
        );
        req.on("error", reject);
        if (signal) {
          signal.addEventListener("abort", () => req.destroy());
        }
        req.write(body);
        req.end();
      }
    );

    if (response.statusCode !== 200) {
      const chunks: Buffer[] = [];
      for await (const chunk of response) {
        chunks.push(chunk as Buffer);
      }
      const errBody = Buffer.concat(chunks).toString();
      throw new Error(
        `Ollama returned ${response.statusCode}: ${errBody}`
      );
    }

    let buffer = "";
    for await (const chunk of response) {
      buffer += (chunk as Buffer).toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data: OllamaStreamChunk = JSON.parse(trimmed);
          if (data.message?.content) {
            yield data.message.content;
          }
          if (data.done) return;
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data: OllamaStreamChunk = JSON.parse(buffer.trim());
        if (data.message?.content) {
          yield data.message.content;
        }
      } catch {
        // ignore
      }
    }
  }

  async chat(
    messages: OllamaMessage[],
    options: { temperature?: number; num_predict?: number } = {}
  ): Promise<string> {
    let result = "";
    for await (const chunk of this.streamChat(messages, options)) {
      result += chunk;
    }
    return result;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const parsed = new URL("/api/tags", this.baseUrl);
      return new Promise((resolve) => {
        const req = this._module(parsed).request(
          this._reqOpts(parsed, "GET", { timeout: 5000 }),
          (res) => resolve(res.statusCode === 200)
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
        req.end();
      });
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModelInfo[]> {
    const parsed = new URL("/api/tags", this.baseUrl);

    return new Promise((resolve) => {
      const req = this._module(parsed).request(
        this._reqOpts(parsed, "GET", { timeout: 5000 }),
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString());
              resolve(
                (body.models || []).map(
                  (m: OllamaModelInfo) => ({
                    name: m.name,
                    size: m.size || 0,
                    modified_at: m.modified_at || "",
                    details: m.details || {},
                  })
                )
              );
            } catch {
              resolve([]);
            }
          });
        }
      );
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
      req.end();
    });
  }

  async listModelNames(): Promise<string[]> {
    const models = await this.listModels();
    return models.map((m) => m.name);
  }
}
