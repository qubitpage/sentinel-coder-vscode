const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sidebarProvider = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
const providers = fs.readFileSync(path.join(root, 'src', 'providers.ts'), 'utf8');
const sidebarJs = fs.readFileSync(path.join(root, 'media', 'sidebar.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const runtime = [sidebarProvider, providers, sidebarJs].join('\n');

assert(!/CHAIN OF THOUGHT|Chain-of-thought|chain-of-thought/i.test(runtime), 'runtime must not contain chain-of-thought wording');
assert(!/hidden chain/i.test(runtime), 'runtime must not mention hidden chain wording');
assert(!/private scratchpad/i.test(runtime), 'runtime must not request/private scratchpad text');
assert(!/raw internal reasoning/i.test(runtime), 'runtime must not request raw internal reasoning');
assert(!/Sentinel is thinking|Thinking\.\.\.|Thought complete/.test(runtime), 'runtime UI must not use thinking/Thought labels');
assert(!/thinkContent|isThinking|lastThinkSent/.test(sidebarProvider), 'backend must not collect or emit private <think> content');
assert(!/thinkingChunk/.test(runtime), 'runtime must not contain hidden-reasoning event names');
assert(!/body\.textContent\s*=\s*data\.content/.test(sidebarJs), 'webview must not render hidden reasoning raw content');
assert(!providers.includes('id: "gpt-5.4-pro"'), 'static Azure catalog must not include unverified gpt-5.4-pro deployment');
assert(!providers.includes('"azure:gpt-5.4-pro":'), 'capability map must not rank unverified gpt-5.4-pro');
assert(!runtime.includes('azure:gpt-5.4-pro'), 'runtime must not contain the deprecated Azure deployment as a contiguous string');
assert(sidebarProvider.includes('_sanitizeAgenticProfilesForPolicy'), 'saved agentic profiles must be sanitized on load');
assert(sidebarProvider.includes('azure:model-router'), 'unsafe saved Azure gpt-5.4-pro profile entries must be redirected to model-router');
assert(sidebarProvider.includes('profile.maxParallelAgents = Math.min(Math.max(1, profile.maxParallelAgents || 1), 2)'), 'Azure/premium profiles must be clamped to conservative parallelism');
assert(sidebarProvider.includes('Never request, reveal, store, or display private reasoning traces or internal deliberation.'), 'system prompt must include provider safety guard');
assert(providers.includes('export function sanitizeProviderPolicyText'), 'providers must export provider-agnostic policy text sanitizer');
assert(providers.includes('export function sanitizeProviderPolicyMessages'), 'providers must export provider-agnostic policy message sanitizer');
assert(providers.includes('export function sanitizeProviderPolicyTools'), 'providers must export provider-agnostic policy tool sanitizer');
assert(providers.includes('sanitizeProviderPolicyMessages(messages)'), 'all provider request bodies must sanitize messages before serialization');
assert(providers.includes('const runtimeTools = sanitizeProviderPolicyTools(options.tools)'), 'all provider request bodies must sanitize tool schemas before serialization');
assert(providers.includes('body.tools = runtimeTools'), 'tool-capable providers must serialize sanitized tools only');
assert(!providers.includes('body.tools = options.tools'), 'providers must never serialize unsanitized tools');
assert(pkg.scripts && pkg.scripts['test:azure-aup'] === 'node tests/azure-aup-compliance.cjs', 'package.json must expose test:azure-aup');
assert(pkg.scripts && pkg.scripts['test:provider-policy'] === 'node tests/provider-policy-guard-regression.cjs', 'package.json must expose test:provider-policy');

process.stdout.write('azure-aup-compliance: ok\n');
