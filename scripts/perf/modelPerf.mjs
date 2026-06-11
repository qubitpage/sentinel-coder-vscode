// Real model performance harness for Sentinel Coder workers.
// Measures, over an OpenAI-compatible streaming endpoint:
//   - TTFT   (time to first streamed token, ms)
//   - total  (full completion latency, ms)
//   - tok/s  (completion tokens per second)
//   - tools  (does the model emit a correct native tool_call?)
// Runs each model N times to expose run-to-run deviation (min/max/avg/stdev).
//
// Usage (PowerShell):
//   $env:PERF_KEY="<provider-api-key>"
//   node scripts/perf/modelPerf.mjs
//
// No secrets are printed. Real API calls only — no mocks.

import https from "node:https";

function writeLine(value = "") {
  process.stdout.write(String(value) + "\n");
}

const BASE = process.env.PERF_BASE || "https://api.groq.com/openai/v1";
const KEY = process.env.PERF_KEY;
const RUNS = Number(process.env.PERF_RUNS || 3);
const MODELS = (process.env.PERF_MODELS ||
  "llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b,qwen/qwen3-32b,meta-llama/llama-4-scout-17b-16e-instruct"
).split(",").map((s) => s.trim()).filter(Boolean);

if (!KEY) {
  console.error("Missing PERF_KEY env var. Set it to a provider API key first.");
  process.exit(1);
}

const url = new URL(BASE + "/chat/completions");

function post(body, onChunk) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KEY}`,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        let full = "";
        res.setEncoding("utf8");
        res.on("data", (d) => {
          buf += d;
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              full = onChunk(j, full);
            } catch { /* partial frame */ }
          }
        });
        res.on("end", () => {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${full || buf}`));
          resolve(full);
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// --- Latency / throughput test (streaming) ---
async function latencyRun(model) {
  const t0 = Date.now();
  let ttft = -1;
  let tokens = 0;
  let usageCompletion = 0;
  await post(
    {
      model,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      max_tokens: 256,
      messages: [
        { role: "system", content: "You are a concise coding assistant." },
        { role: "user", content: "Write a Python function fib(n) that returns the nth Fibonacci number iteratively. Code only." },
      ],
    },
    (j, full) => {
      const delta = j.choices?.[0]?.delta?.content || "";
      if (delta) {
        if (ttft < 0) ttft = Date.now() - t0;
        tokens++;
        full += delta;
      }
      if (j.usage?.completion_tokens) usageCompletion = j.usage.completion_tokens;
      return full;
    }
  );
  const total = Date.now() - t0;
  const compTokens = usageCompletion || tokens;
  const toks = total > 0 ? (compTokens / (total / 1000)) : 0;
  return { ttft, total, toks, compTokens };
}

// --- Tool-calling correctness test ---
async function toolRun(model) {
  const tools = [
    {
      type: "function",
      function: {
        name: "readFile",
        description: "Read a file from the workspace",
        parameters: {
          type: "object",
          properties: { path: { type: "string", description: "File path" } },
          required: ["path"],
        },
      },
    },
  ];
  let toolName = null;
  let toolArgs = "";
  await post(
    {
      model,
      stream: true,
      temperature: 0,
      max_tokens: 256,
      tools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: "You are an agent. Use tools to act. Do not answer from memory." },
        { role: "user", content: "Read the file src/index.ts and tell me what it does." },
      ],
    },
    (j, full) => {
      const tc = j.choices?.[0]?.delta?.tool_calls?.[0];
      if (tc) {
        if (tc.function?.name) toolName = tc.function.name;
        if (tc.function?.arguments) toolArgs += tc.function.arguments;
      }
      return full;
    }
  );
  let ok = false;
  let parsedPath = "";
  if (toolName === "readFile") {
    try {
      const a = JSON.parse(toolArgs || "{}");
      parsedPath = a.path || "";
      ok = typeof parsedPath === "string" && parsedPath.includes("index.ts");
    } catch { ok = false; }
  }
  return { ok, toolName, parsedPath };
}

function stats(arr) {
  const xs = arr.filter((x) => x >= 0);
  if (xs.length === 0) return { min: 0, max: 0, avg: 0, std: 0 };
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = Math.sqrt(xs.reduce((a, b) => a + (b - avg) ** 2, 0) / xs.length);
  return { min: Math.min(...xs), max: Math.max(...xs), avg, std };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v) => (Number.isFinite(v) ? v.toFixed(0) : "-");

(async () => {
  writeLine(`\nSentinel Coder — model perf harness  (base=${url.hostname}, runs=${RUNS})\n`);
  writeLine(pad("model", 42) + pad("TTFT(ms) avg/std", 20) + pad("total(ms) avg", 14) + pad("tok/s avg/min", 16) + "tools");
  writeLine("-".repeat(108));
  const summary = [];
  for (const model of MODELS) {
    const ttfts = [], totals = [], tokss = [];
    let toolPass = 0, toolTotal = 0, lastErr = "";
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await latencyRun(model);
        ttfts.push(r.ttft); totals.push(r.total); tokss.push(r.toks);
      } catch (e) { lastErr = e.message.slice(0, 80); }
    }
    for (let i = 0; i < RUNS; i++) {
      try {
        const t = await toolRun(model);
        toolTotal++; if (t.ok) toolPass++;
      } catch (e) { lastErr = e.message.slice(0, 80); }
    }
    const tt = stats(ttfts), to = stats(totals), tk = stats(tokss);
    const toolStr = toolTotal ? `${toolPass}/${toolTotal}` : "err";
    writeLine(
      pad(model, 42) +
      pad(`${num(tt.avg)}/${num(tt.std)}`, 20) +
      pad(num(to.avg), 14) +
      pad(`${tk.avg.toFixed(1)}/${tk.min.toFixed(1)}`, 16) +
      toolStr + (lastErr ? `  ! ${lastErr}` : "")
    );
    summary.push({ model, ttft: tt, total: to, toks: tk, tool: toolStr, err: lastErr });
  }
  writeLine("\nDeviation notes:");
  for (const s of summary) {
    const jitter = s.ttft.avg > 0 ? ((s.ttft.std / s.ttft.avg) * 100).toFixed(0) : "0";
    writeLine(`  ${pad(s.model, 42)} TTFT jitter ${jitter}%  | throughput ${s.toks.avg.toFixed(1)} tok/s  | tool-calling ${s.tool}`);
  }
  writeLine("");
})();
