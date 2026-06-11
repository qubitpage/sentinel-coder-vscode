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

// 3.16.14: Agentic orchestration must degrade gracefully when a free/cheap worker is throttled.
assert(src.includes('_subAgentCooldowns = new Map'), 'sub-agent cooldown registry must exist');
assert(src.includes('_subAgentErrorInfo(error: unknown)'), 'sub-agent error classifier must exist');
assert(src.includes('429|rate.?limit|retry-after|quota|temporar|throttl|overload|upstream|503|502|504|timeout'), 'transient/rate-limit error classifier must detect 429/quota/upstream failures');
assert(src.includes('_runSubAgentResilient'), 'resilient sub-agent fallback runner must exist');
assert(src.includes('cooling it down and trying another configured worker'), 'rate-limited workers must emit a clear cooldown/fallback note');
assert(src.includes('All configured sub-agent candidates failed or were rate-limited'), 'all-worker-failed path must return a warning instead of raw provider crash');
assert(/const pool: string\[\] = \[primary\][\s\S]*profile\.defaultWorkerModel[\s\S]*profile\.workerModels[\s\S]*profile\.reviewerModels/.test(src), 'fallback candidate order must include primary, default worker, workers, and reviewers');

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const article = fs.readFileSync(path.join(root, 'docs', 'MULTI_PROVIDER_MODEL_ARTICLE.md'), 'utf8');
const toolRegistry = fs.readFileSync(path.join(root, 'src', 'toolRegistry.ts'), 'utf8');
const remoteWorkspaceDocs = fs.readFileSync(path.join(root, 'docs', 'REMOTE_WORKSPACE_TOOLS.md'), 'utf8');
assert(readme.includes('docs/MULTI_PROVIDER_MODEL_ARTICLE.md'), 'Marketplace README must link the multi-provider model article');
assert(readme.includes('sentinel-coder-3-16-14-marketplace-hero.png'), 'Marketplace README must reference the generated 3.16.14 hero asset');
assert(changelog.includes('3.16.14') && changelog.includes('Resilient Agentic worker fallback'), 'CHANGELOG must describe 3.16.14 resilient fallback');
assert(article.includes('OpenRouter') && article.includes('claude-fable') && article.includes('Agentic Profiles'), 'article must cover OpenRouter Claude/Fable-style models and Agentic Profiles');
assert(article.includes('Free') && article.includes('Paid') && article.includes('Unknown price'), 'article must explain free/paid/unknown price strategy');

// 3.16.15: Remote Explorer sessions should be controllable through the active VS Code remote host, not by re-asking for SSH keys.
assert(toolRegistry.includes('name: "remoteWorkspaceCommand"'), 'remoteWorkspaceCommand tool must be registered');
assert(toolRegistry.includes('isVsCodeRemoteWorkspaceHost'), 'remote workspace host detector must exist');
assert(toolRegistry.includes('vscode.env.remoteName'), 'remote workspace command must detect VS Code Remote extension host state');
assert(toolRegistry.includes('allowLocalFallback'), 'remote workspace command must require an explicit local fallback opt-in');
assert(toolRegistry.includes('requires an active VS Code Remote workspace host'), 'remote workspace command must refuse fake remote execution by default');
assert(readme.includes('docs/REMOTE_WORKSPACE_TOOLS.md'), 'Marketplace README must link Remote Workspace Tools docs');
assert(changelog.includes('3.16.15') && changelog.includes('remoteWorkspaceCommand'), 'CHANGELOG must describe 3.16.15 remote workspace tool');
assert(remoteWorkspaceDocs.includes('Remote SSH') && remoteWorkspaceDocs.includes('does **not** ask for SSH private keys'), 'Remote Workspace docs must explain Remote SSH and no-key reuse');
assert(remoteWorkspaceDocs.includes('pure browser vscode.dev') && remoteWorkspaceDocs.includes('Remote Tool Bridge'), 'Remote Workspace docs must explain browser limitations and bridge path');

// 3.16.16: Local and remote commands must support multiple named terminal sessions with resource guardrails.
assert(toolRegistry.includes('class TerminalSessionManager'), 'terminal session manager must exist');
assert(toolRegistry.includes('normalizeTerminalSessionId'), 'terminal session IDs must be normalized');
assert(toolRegistry.includes('terminalMaxSessions'), 'terminal max-session setting must be enforced');
assert(toolRegistry.includes('terminalMinFreeMemoryMb'), 'terminal free-memory guard setting must be enforced');
assert(toolRegistry.includes('terminalIdleCleanupSeconds'), 'idle session cleanup setting must be enforced');
assert(toolRegistry.includes('getShell(args.sessionId)'), 'run/remote command tools must route through named terminal sessions');
assert(toolRegistry.includes('canStart(args.sessionId)'), 'run/remote command tools must check resource guardrails before starting sessions');
assert(toolRegistry.includes('Use a different sessionId for parallel work'), 'busy-session output must guide users to use another sessionId');
const readmeLower = readme.toLowerCase();
const changelogLower = changelog.toLowerCase();
assert(readme.includes('New in 3.16.16') && readmeLower.includes('multi-session terminal pool'), 'Marketplace README must describe 3.16.16 multi-session terminal pool');
assert(readme.includes('sentinelCoder.terminalMaxSessions') && readme.includes('sentinelCoder.terminalMinFreeMemoryMb'), 'Marketplace README must document terminal guardrail settings');
assert(changelog.includes('3.16.16') && changelogLower.includes('multi-session terminal'), 'CHANGELOG must describe 3.16.16 multi-session terminals');
process.stdout.write('agentic-profiles-regression: ok\n');
