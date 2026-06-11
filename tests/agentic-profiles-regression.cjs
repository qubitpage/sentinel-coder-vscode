const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }
const requiredProfiles = [
  'profile_standard_single_model',
  'profile_free_multi_provider_coding',
  'profile_openrouter_free_coding_swarm',
  'profile_groq_free_fast_oss',
  'profile_gemini_free_tier_research',
  'profile_local_free_private',
  'profile_provider_best_available',
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
for (const id of requiredProfiles) assert(src.includes(`id: "${id}"`) || src.includes(`const STANDARD_AGENTIC_PROFILE_ID = "${id}"`), `missing built-in profile ${id}`);
assert(src.includes('Single Model Full Capability'), 'standard single-model capability profile must exist');
assert(src.includes('FREE: Multi-Provider Coding Council'), 'free multi-provider coding council must exist');
assert(src.includes('Use discovered free/free-tier/local models only; do not escalate to paid models.'), 'free multi-provider profile must forbid paid escalation');
assert(src.includes('Use only OpenRouter models marked :free or free-priced in the live catalog.'), 'OpenRouter free profile must rely on free catalog models');
assert(src.includes('Use only local Ollama models.'), 'local free profile must avoid cloud/API cost');
assert(src.includes('allowPremiumWorkers: false'), 'free profiles must disable premium workers');
assert(src.includes('Adaptive: Best Available From Your Keys'), 'adaptive best-available profile must exist');
assert(src.includes('Azure: Cost-Smart Production'), 'Azure cost-smart profile must exist');
assert(src.includes('Multi-Provider: Frontier Council'), 'multi-provider council profile must exist');
assert(src.includes('Object.assign(existing, def, { updatedAt: now })'), 'updated built-in definitions must persist for existing installs');
assert(/_profileMainModel\(profile: AgenticProfile\)[\s\S]*_availableModel\(profile\.mainModel\)[\s\S]*_firstAvailable\(profile\.reviewerModels\)[\s\S]*_firstAvailable\(profile\.workerModels\)/.test(src), 'profile main model must fall back to available reviewer/worker/cached model');
assert(src.includes('delegateTeam') && src.includes('delegateSubAgent'), 'Agentic skill must document sub-agent delegation tools');
assert(src.includes('firewall') || src.includes('security'), 'profiles/skills must include safe-coding/security review strategy');
process.stdout.write('agentic-profiles-regression: ok\n');
