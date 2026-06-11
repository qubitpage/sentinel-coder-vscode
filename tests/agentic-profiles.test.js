const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');

const requiredProfiles = [
  'profile_standard_single_model',
  'profile_azure_cost_smart_production',
  'profile_azure_frontier_architect',
  'profile_openai_balanced_coding',
  'profile_anthropic_claude_code_quality',
  'profile_openrouter_balanced_coding',
  'profile_groq_fast_swarm',
  'profile_local_private_ollama',
  'profile_multi_provider_frontier_council',
  'profile_mistral_deepseek_together_open_compat'
];

for (const id of requiredProfiles) {
  assert(src.includes(`id: "${id}"`) || src.includes(`id: ${id}`), `missing built-in Agentic profile ${id}`);
}

const requiredProviders = ['azure:', 'openai:', 'anthropic:', 'openrouter:', 'groq:', 'ollama:', 'mistral:', 'deepseek:', 'together:', 'moonshot:'];
for (const providerPrefix of requiredProviders) {
  assert(src.includes(providerPrefix), `missing provider prefix in built-in profile presets: ${providerPrefix}`);
}

const requiredStrategy = [
  'planner-worker-reviewer',
  'adversarial critique',
  'final hard critique',
  'Main model must',
  'verify',
  'firewall',
  'costPolicy: "cost-first"',
  'costPolicy: "quality-first"'
];
for (const marker of requiredStrategy) {
  assert(src.includes(marker), `missing orchestration strategy marker: ${marker}`);
}

process.stdout.write(`agentic-profiles.test.js passed (${requiredProfiles.length} built-in profiles verified)\n`);
