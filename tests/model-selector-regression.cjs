const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'media', 'sidebar.js'), 'utf8');
const sidebarProviderTs = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
const providersTs = fs.readFileSync(path.join(root, 'src', 'providers.ts'), 'utf8');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }
function count(re) { return (sidebar.match(re) || []).length; }

assert(sidebar.includes('Agentic Modes - profile orchestration'), 'chat selector must show Agentic Modes group first');
assert(sidebar.includes('Most used models and modes'), 'chat selector must show Most used models and modes group');
assert(sidebar.includes('appendProviderCostGroups'), 'selector must group all models by provider/cost');
assert(sidebar.includes('Free') && sidebar.includes('Paid / metered') && sidebar.includes('Local / self-hosted'), 'selector must classify free/paid/local cost groups');
assert(sidebar.includes('effectiveContextWindow') && sidebar.includes('contextSource') && sidebar.includes('supportsTools'), 'selector labels/tooltips must surface live context/tool metadata');
assert(sidebar.includes('renderCategorizedChatModelSelect'), 'modelList branch must use categorized renderer');
assert(!sidebar.includes('sentinelFinalProviderDisplayName'), 'stale late selector override must be removed');
assert(!sidebar.includes('sentinelFinalModelValue'), 'modelList branch must not call undefined sentinelFinalModelValue');
assert(sidebar.includes('lastGoodModelList'), 'selector must preserve last good model list when live discovery sends Auto-only');
assert(sidebar.includes('incomingNormalModels.length > 0'), 'selector must detect and reject Auto-only replacement lists');
assert(count(/function providerDisplayName\(/g) === 1, 'providerDisplayName must have one canonical definition');
assert(count(/function populateAgenticModelSelect\(/g) === 1, 'populateAgenticModelSelect must have one canonical definition');
assert(sidebarProviderTs.includes('effectiveContextWindow'), 'backend must send effectiveContextWindow metadata');
assert(sidebarProviderTs.includes('supportedParameters'), 'backend must send supportedParameters metadata');
assert(providersTs.includes('Provider catalog/metadata outages must not collapse the whole chat selector to Auto'), 'provider discovery failures must be provider-local');
assert(sidebarProviderTs.includes('models: [autoOption, ...profileItems, ...cachedItems]'), 'refresh fallback must send cached/provider/profile models, not Auto-only');
process.stdout.write('model-selector-regression: ok\n');
