import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";

export interface MicrosoftIqGroundingResult {
  enabled: boolean;
  configured: boolean;
  layer: string;
  status: "disabled" | "not-configured" | "ok" | "error";
  query: string;
  sources: Array<{ title: string; url?: string; snippet: string }>;
  summary?: string;
  error?: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSource(item: any, index: number): { title: string; url?: string; snippet: string } | undefined {
  if (!item || typeof item !== "object") return undefined;
  const doc = item.document || item.source || item.chunk || item;
  const title = asString(item.title) || asString(doc.title) || asString(item.name) || asString(doc.source) || `Foundry IQ source ${index + 1}`;
  const url = asString(item.url) || asString(doc.url) || asString(item.uri) || asString(item.link) || undefined;
  const snippet =
    asString(item.snippet) ||
    asString(doc.snippet) ||
    asString(item.content) ||
    asString(doc.content) ||
    asString(item.text) ||
    asString(doc.text) ||
    asString(item.summary) ||
    asString(doc.description);
  if (!snippet && !url) return undefined;
  return { title, url, snippet: snippet.slice(0, 1600) };
}

function collectSources(payload: any): Array<{ title: string; url?: string; snippet: string }> {
  const candidates: any[] = [];
  for (const key of ["sources", "results", "documents", "citations", "references", "value", "data"]) {
    if (Array.isArray(payload?.[key])) candidates.push(...payload[key]);
  }
  if (Array.isArray(payload)) candidates.push(...payload);
  const sources = candidates.map((x, i) => normalizeSource(x, i)).filter(Boolean) as Array<{ title: string; url?: string; snippet: string }>;
  return sources.slice(0, 8);
}

function extractSummary(payload: any): string {
  if (typeof payload === "string") return payload.slice(0, 4000);
  for (const key of ["summary", "answer", "content", "text", "grounding", "context"]) {
    const value = asString(payload?.[key]);
    if (value) return value.slice(0, 4000);
  }
  return "";
}

function postJson(endpoint: string, body: object, headers: Record<string, string>, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const lib = url.protocol === "http:" ? http : https;
    const raw = JSON.stringify(body);
    const req = lib.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "content-length": Buffer.byteLength(raw).toString(),
        ...headers
      },
      timeout: timeoutMs
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", d => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
          return;
        }
        try { resolve(text ? JSON.parse(text) : {}); }
        catch { resolve({ summary: text }); }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

function looksLikeJwt(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}


export async function getMicrosoftIqGrounding(query: string, workspaceName: string): Promise<MicrosoftIqGroundingResult> {
  const config = vscode.workspace.getConfiguration("sentinelCoder");
  const enabled = config.get<boolean>("microsoftIq.enabled", false);
  const layer = config.get<string>("microsoftIq.layer", "foundry-iq");
  const endpoint = config.get<string>("microsoftIq.endpoint", "").trim();
  const apiKeyEnv = config.get<string>("microsoftIq.apiKeyEnv", "MICROSOFT_IQ_API_KEY").trim();
  const knowledgeSourceName = config.get<string>("microsoftIq.knowledgeSourceName", "sentinel-coder-iq-ks").trim();
  const timeoutMs = Math.max(1000, config.get<number>("microsoftIq.timeoutMs", 12000));
  const maxQueryChars = Math.max(128, config.get<number>("microsoftIq.maxQueryChars", 4000));
  const cleanQuery = String(query || "").slice(0, maxQueryChars);

  if (!enabled) return { enabled: false, configured: false, layer, status: "disabled", query: cleanQuery, sources: [] };
  if (!endpoint) return { enabled: true, configured: false, layer, status: "not-configured", query: cleanQuery, sources: [], error: "sentinelCoder.microsoftIq.endpoint is empty" };

  const isAzureSearchDocs = /\.search\.windows\.net\/indexes\/[^/]+\/docs\/search/i.test(endpoint);
  const isFoundryKnowledgeBase = /\.search\.windows\.net\/knowledgebases\/[^/]+\/retrieve/i.test(endpoint);
  const headers: Record<string, string> = { "x-sentinel-iq-layer": layer };
  const token = apiKeyEnv ? (process.env[apiKeyEnv] || "") : "";

  try {
    let requestBody: object;
    if (isFoundryKnowledgeBase) {
      if (!token) {
        return {
          enabled: true,
          configured: false,
          layer,
          status: "not-configured",
          query: cleanQuery,
          sources: [],
          error: `Foundry IQ Knowledge Base endpoint requires an Azure Search bearer token in environment variable ${apiKeyEnv || "MICROSOFT_IQ_BEARER_TOKEN"}. Runtime shell/Azure CLI token acquisition is disabled for security.`
        };
      }
      if (!looksLikeJwt(token)) {
        return {
          enabled: true,
          configured: true,
          layer,
          status: "error",
          query: cleanQuery,
          sources: [],
          error: `Foundry IQ Knowledge Base endpoint requires a bearer/JWT token in ${apiKeyEnv}. The configured value is not a bearer token. Use an Azure Search AAD token, or switch endpoint to /indexes/.../docs/search for api-key mode.`
        };
      }
      headers.authorization = `Bearer ${token}`;
      requestBody = {
        intents: [{ type: "semantic", search: cleanQuery || "Sentinel Coder One" }],
        knowledgeSourceParams: [{ knowledgeSourceName: knowledgeSourceName || "sentinel-coder-iq-ks", kind: "searchIndex" }]
      };
    } else if (isAzureSearchDocs) {
      if (token) headers["api-key"] = token;
      requestBody = { search: cleanQuery || "*", top: 8, queryType: "simple" };
    } else {
      if (token) headers.authorization = `Bearer ${token}`;
      requestBody = { query: cleanQuery, workspace: workspaceName, layer, topK: 8 };
    }

    const payload = await postJson(endpoint, requestBody, headers, timeoutMs);
    return {
      enabled: true,
      configured: true,
      layer,
      status: "ok",
      query: cleanQuery,
      summary: extractSummary(payload),
      sources: collectSources(payload)
    };
  } catch (error: any) {
    return { enabled: true, configured: true, layer, status: "error", query: cleanQuery, sources: [], error: String(error?.message || error) };
  }
}

export function formatMicrosoftIqGroundingForPrompt(result: MicrosoftIqGroundingResult): string {
  if (!result.enabled) return "";
  const title = `Microsoft IQ (${result.layer}) grounding`;
  if (result.status === "not-configured") return `${title}: enabled but not configured. ${result.error || "Set sentinelCoder.microsoftIq.endpoint."}`;
  if (result.status === "error") return `${title}: retrieval failed non-fatally. Continue, but mention missing IQ grounding if relevant. Error: ${result.error || "unknown"}`;
  if (result.status !== "ok") return "";
  const lines: string[] = [
    `${title}: use this retrieved enterprise/project context before answering. Do not invent sources; cite source titles/URLs when useful.`
  ];
  if (result.summary) lines.push(`Summary: ${result.summary}`);
  result.sources.forEach((src, i) => {
    lines.push(`${i + 1}. ${src.title}${src.url ? ` (${src.url})` : ""}: ${src.snippet}`);
  });
  return lines.join("\n");
}
