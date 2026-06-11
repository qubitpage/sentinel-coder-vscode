// Agentic loop E2E test — proves a real model will:
//   1) receive a tool spec, decide to call it (tool_calls in streamed delta),
//   2) accept a tool result message,
//   3) produce a correct final answer grounded in that result.
// This mirrors the extension's _runNativeAgentLoop contract (OpenAI-compatible
// tool calling) against a real provider. No mocks.
//
// Usage:
//   $env:PERF_KEY="<provider-api-key>"
//   node scripts/perf/agenticLoop.mjs

import https from "node:https";

const BASE = process.env.PERF_BASE || "https://api.groq.com/openai/v1";
const KEY = process.env.PERF_KEY;
const MODELS = (process.env.PERF_MODELS ||
  "llama-3.3-70b-versatile,openai/gpt-oss-20b,qwen/qwen3-32b,meta-llama/llama-4-scout-17b-16e-instruct"
).split(",").map((s) => s.trim()).filter(Boolean);

if (!KEY) { console.error("Missing PERF_KEY"); process.exit(1); }
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
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const tools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get the current temperature for a city in Celsius.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "City name" } },
        required: ["city"],
      },
    },
  },
];

async function runAgentic(model) {
  const messages = [
    { role: "system", content: "You are an agent. You MUST use the provided tools to get real data before answering. Never guess." },
    { role: "user", content: "What is the temperature in Oslo right now? Use the tool, then answer in one short sentence." },
  ];

  // Step 1: expect a tool call
  const r1 = await call({ model, messages, tools, tool_choice: "auto", temperature: 0, max_tokens: 256 });
  const m1 = r1.choices?.[0]?.message;
  const tc = m1?.tool_calls?.[0];
  if (!tc || tc.function?.name !== "getWeather") {
    return { step1: false, step2: false, final: "", note: "no tool call" };
  }
  let city = "";
  try { city = JSON.parse(tc.function.arguments || "{}").city || ""; } catch { /* ignore */ }
  const calledOslo = /oslo/i.test(city);

  // Step 2: feed the tool result back, expect a grounded final answer
  messages.push({ role: "assistant", content: m1.content || "", tool_calls: m1.tool_calls });
  messages.push({ role: "tool", tool_call_id: tc.id, content: "12" }); // 12 °C
  const r2 = await call({ model, messages, tools, temperature: 0, max_tokens: 256 });
  const final = (r2.choices?.[0]?.message?.content || "").trim();
  const grounded = /12/.test(final) && /oslo/i.test(final);

  return { step1: calledOslo, step2: grounded, final: final.slice(0, 90), note: "" };
}

(async () => {
  console.log(`\nAgentic loop E2E (base=${url.hostname})\n`);
  console.log("model".padEnd(42) + "tool-call".padEnd(12) + "grounded-answer".padEnd(18) + "sample");
  console.log("-".repeat(100));
  let pass = 0, total = 0;
  for (const model of MODELS) {
    total++;
    try {
      const r = await runAgentic(model);
      const ok = r.step1 && r.step2;
      if (ok) pass++;
      console.log(
        model.padEnd(42) +
        (r.step1 ? "yes" : "NO").padEnd(12) +
        (r.step2 ? "yes" : "NO").padEnd(18) +
        (r.final || r.note)
      );
    } catch (e) {
      console.log(model.padEnd(42) + ("err: " + e.message.slice(0, 50)));
    }
  }
  console.log(`\nAgentic E2E: ${pass}/${total} models completed plan→tool→grounded-answer.\n`);
  process.exit(pass === total ? 0 : 1);
})();
