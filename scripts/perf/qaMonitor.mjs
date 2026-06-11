// QA consumption monitor — drives a realistic multi-step "build a small app"
// agentic task through the SAME OpenAI-compatible tool-calling contract the
// extension's _runNativeAgentLoop uses, then reports REAL token consumption,
// latency, tool-call counts and (when the provider reports usage) cost per
// model. Use it to pick the best model configuration for production.
//
// No mocks: every number comes from the live provider's `usage` object plus
// wall-clock timing. The task is a 3-step build:
//   1) create package.json     (writeFile)
//   2) create server.js         (writeFile)
//   3) create README.md         (writeFile) + final summary
//
// Usage (OpenAI-compatible provider):
//   $env:PERF_KEY="<provider-api-key>"
//   node scripts/perf/qaMonitor.mjs
// Optional: PERF_BASE, PERF_MODELS (comma list), PERF_PRICES ("model=in/out,..." $ per 1M tokens)

import https from "node:https";

function writeLine(value = "") {
  process.stdout.write(String(value) + "\n");
}

const BASE = process.env.PERF_BASE || "https://api.groq.com/openai/v1";
const KEY = process.env.PERF_KEY;
const MODELS = (process.env.PERF_MODELS ||
  "llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3-32b,meta-llama/llama-4-scout-17b-16e-instruct"
).split(",").map((s) => s.trim()).filter(Boolean);

// Optional real pricing ($ per 1M tokens) so cost is shown only when known.
const PRICES = {};
for (const pair of (process.env.PERF_PRICES || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const [m, io] = pair.split("=");
  const [inp, out] = (io || "").split("/").map(Number);
  if (m && Number.isFinite(inp) && Number.isFinite(out)) PRICES[m] = { in: inp, out };
}

if (!KEY) { console.error("Missing PERF_KEY (set it to a provider API key)"); process.exit(1); }
const url = new URL(BASE + "/chat/completions");

function call(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KEY}`,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (buf += d));
        res.on("end", () => {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 240)}`));
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// A single write-file tool, exactly like the extension exposes createFile.
const tools = [
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Create or overwrite a file in the project with the given content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path, e.g. server.js" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
];

const SYSTEM =
  "You are an autonomous coding agent. Build the requested project by calling the writeFile tool once per file. " +
  "Create exactly these three files in order: package.json, server.js, README.md. " +
  "After the third file is written and its tool result returns, reply with a one-sentence summary and STOP (no more tool calls).";

const TASK =
  "Build a minimal Node.js HTTP server project that responds 'Hello from Sentinel' on port 3000. " +
  "Files: package.json (name, version, start script), server.js (the http server), README.md (how to run). Use only the Node stdlib.";

async function runOne(model) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: TASK },
  ];
  let promptToks = 0, completionToks = 0, toolCalls = 0, steps = 0, filesWritten = 0;
  const t0 = Date.now();
  const MAX_STEPS = 8;

  for (let i = 0; i < MAX_STEPS; i++) {
    steps++;
    const resp = await call({ model, messages, tools, temperature: 0.2, max_tokens: 1500 });
    const u = resp.usage || {};
    promptToks += u.prompt_tokens || 0;
    completionToks += u.completion_tokens || 0;
    const msg = resp.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);

    const calls = msg.tool_calls || [];
    if (calls.length === 0) break; // model gave its final summary

    for (const c of calls) {
      toolCalls++;
      let args = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* ignore */ }
      if (args.path && typeof args.content === "string") filesWritten++;
      messages.push({
        role: "tool",
        tool_call_id: c.id,
        content: `Wrote ${args.path || "file"} (${(args.content || "").length} bytes).`,
      });
    }
  }

  const elapsed = Date.now() - t0;
  const totalToks = promptToks + completionToks;
  const price = PRICES[model];
  const cost = price ? (promptToks / 1e6) * price.in + (completionToks / 1e6) * price.out : null;
  return { model, promptToks, completionToks, totalToks, toolCalls, steps, filesWritten, elapsed, cost };
}

(async () => {
  writeLine(`QA consumption monitor — ${MODELS.length} model(s) building a 3-file Node app`);
  writeLine(`Endpoint: ${BASE}\n`);
  const rows = [];
  for (const m of MODELS) {
    process.stdout.write(`• ${m} … `);
    try {
      const r = await runOne(m);
      rows.push(r);
      writeLine(
        `${r.filesWritten}/3 files, ${r.totalToks} tok (${r.promptToks} in / ${r.completionToks} out), ` +
        `${r.toolCalls} tool call(s), ${r.steps} step(s), ${(r.elapsed / 1000).toFixed(1)}s` +
        (r.cost !== null ? `, ~$${r.cost.toFixed(5)}` : "")
      );
    } catch (e) {
      writeLine(`FAILED: ${e.message}`);
    }
  }

  const ok = rows.filter((r) => r.filesWritten >= 3);
  writeLine("\n── Summary ──────────────────────────────────────────");
  writeLine(`Completed (3/3 files): ${ok.length}/${rows.length}`);
  if (ok.length) {
    const leastToks = [...ok].sort((a, b) => a.totalToks - b.totalToks)[0];
    const fastest = [...ok].sort((a, b) => a.elapsed - b.elapsed)[0];
    writeLine(`Most token-efficient: ${leastToks.model} (${leastToks.totalToks} tok)`);
    writeLine(`Fastest end-to-end:   ${fastest.model} (${(fastest.elapsed / 1000).toFixed(1)}s)`);
    const priced = ok.filter((r) => r.cost !== null).sort((a, b) => a.cost - b.cost)[0];
    if (priced) writeLine(`Cheapest (priced):    ${priced.model} (~$${priced.cost.toFixed(5)})`);
    writeLine(`\nRecommended production config: ${leastToks.model} ` +
      `(best token economy at ${leastToks.totalToks} tok, ${(leastToks.elapsed / 1000).toFixed(1)}s, ${leastToks.filesWritten}/3 files).`);
  }
  // Exit non-zero only if NO model completed the build.
  process.exit(ok.length > 0 ? 0 : 1);
})();
