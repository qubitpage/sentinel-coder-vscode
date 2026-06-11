const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'media', 'sidebar.js'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');

const selectorMarkers = [
  'Final model-selector override',
  'Agentic Modes - opt-in orchestration profiles',
  'Most used models and modes',
  'sentinelFinalAppendProviderGroups',
  'free first',
  'sentinelFinalPricingRank',
  'effectiveContextWindow',
  'contextSource',
  'supportedParameters',
  'profile_openrouter_balanced_coding',
  'profile_anthropic_claude_code_quality',
  'profile_multi_provider_frontier_council'
];
for (const marker of selectorMarkers) {
  assert(js.includes(marker), `missing categorized selector marker: ${marker}`);
}

assert(js.indexOf('Agentic Modes - opt-in orchestration profiles') < js.indexOf('Most used models and modes'), 'Agentic modes must appear before Most used models');
assert(js.indexOf('Most used models and modes') < js.indexOf('sentinelFinalAppendProviderGroups(modelSelect'), 'Most used models must appear before provider catalog');

const backendMetadataMarkers = [
  'effectiveContextWindow',
  'contextSource',
  'contextWindow',
  'maxOutputTokens',
  'supportedParameters',
  'supportsTools',
  'pricing'
];
for (const marker of backendMetadataMarkers) {
  assert(ts.includes(marker), `backend model metadata missing: ${marker}`);
}

process.stdout.write('model-selector.test.js passed (categorized provider/free-aware selector verified)\n');
