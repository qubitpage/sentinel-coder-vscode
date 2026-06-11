const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const providers = fs.readFileSync(path.join(root, 'src', 'providers.ts'), 'utf8');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

assert(/supportsTools/.test(providers), 'provider model metadata must expose supportsTools');
assert(/supportedParameters/.test(providers), 'provider model metadata must expose supportedParameters');
assert(/nativeTools|tool_choice|tools/.test(providers), 'provider request layer must route native tools/tool_choice deliberately');
assert(/effectiveContextWindow|contextSource|contextWindow/.test(providers), 'provider discovery must preserve context-window metadata');
assert(/OpenRouter|openrouter/i.test(providers), 'OpenRouter support must remain present');
assert(/Anthropic|anthropic/i.test(providers), 'Anthropic support must remain present');
assert(/Groq|groq/i.test(providers), 'Groq support must remain present');
assert(/Azure|azure/i.test(providers), 'Azure support must remain present');

process.stdout.write('provider-capability-regression: ok\n');
