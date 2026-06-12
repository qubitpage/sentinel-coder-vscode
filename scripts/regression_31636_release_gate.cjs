const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => { if (!cond) fail(msg); };

const providers = read('src/providers.ts');
const sidebarTs = read('src/sidebarProvider.ts');
const sidebarJs = read('media/sidebar.js');
const sidebarHtml = read('media/sidebar.html');

assert(/function resolveMaxOutputTokens\(/.test(providers), 'providers.ts must clamp provider/model output budgets before requests');
assert(/azureReasoningSafeCap[\s\S]*32768/.test(providers), 'Azure GPT-5.x safe completion cap must be 32768 to prevent Foundry 400 errors');
assert(/const safeMaxTokens = resolveMaxOutputTokens\(provider, model, options\.max_tokens, 4096\)/.test(providers), 'buildRequestBody must use safeMaxTokens');
assert(!/body\.max_completion_tokens = options\.max_tokens \|\| 4096/.test(providers), 'restricted OpenAI/Azure branch still uses raw max_tokens');
assert(!/body\.max_tokens = options\.max_tokens \|\| 4096/.test(providers), 'OpenAI-compatible branch still uses raw max_tokens');
assert(!/maxOutputTokens: options\.max_tokens \|\| 4096/.test(providers), 'Google branch still uses raw max_tokens');
assert(!/num_predict: options\.max_tokens \?\? 2048/.test(providers), 'Ollama branch still uses raw max_tokens');

assert(/id="model-select"/.test(sidebarHtml), 'chat model selector element is missing from sidebar.html');
assert(/modelSelect\s*=\s*\$\("model-select"\)/.test(sidebarJs), 'sidebar.js must bind the chat model selector');
assert(/agentic/i.test(sidebarJs) && /profile/i.test(sidebarJs), 'sidebar.js must include Agentic profile UI logic');
assert(/setModel/.test(sidebarJs), 'sidebar.js must post selected chat model to extension host');
assert(/modelOptions|models/.test(sidebarJs), 'sidebar.js must render provider model options');

assert(/TurnAgentUsage/.test(sidebarTs), 'sidebarProvider.ts must track turn agent/model usage');
assert(/turnUsage|modelUsage|agentUsage|modelsUsed|usage/.test(sidebarTs), 'sidebarProvider.ts must emit per-turn model/usage telemetry');
assert(/_runAgenticPreflightIfNeeded/.test(sidebarTs), 'Agentic preflight orchestration must still be wired');
assert(/_resolveModelForTask/.test(sidebarTs), 'Autopilot/Auto model resolution must still be wired');

console.log('regression_31636_release_gate passed');
