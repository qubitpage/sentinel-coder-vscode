const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const mcpClient = fs.readFileSync(path.join(root, 'src', 'mcpClient.ts'), 'utf8');
const toolRegistry = fs.readFileSync(path.join(root, 'src', 'toolRegistry.ts'), 'utf8');
const studioProvider = fs.readFileSync(path.join(root, 'src', 'studioProvider.ts'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'media', 'sidebar.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// MCP local built-ins: Windows Desktop must launch npx via npx.cmd/exe resolution under shell:false.
assert(mcpClient.includes('function resolveExecutable(command: string)'), 'MCP client must resolve executable names before spawn');
assert(mcpClient.includes('process.platform !== "win32"'), 'MCP executable resolution must be Windows-aware');
assert(mcpClient.includes('`${raw}.cmd`') || mcpClient.includes("`${raw}.cmd`"), 'MCP executable resolution must try .cmd for npx/npm on Windows');
assert(mcpClient.includes('child_process.spawn(command, mcpArgv'), 'MCP spawn must use the resolved executable, not raw config command');
assert(mcpClient.includes('shell: false'), 'MCP should keep shell:false for safer subprocess launch');
assert(mcpClient.includes('mcpRequestTimeoutMs'), 'MCP startup/request timeout helper must exist');
assert(mcpClient.includes('120000'), 'MCP npx first-run startup timeout must allow npm package install/download time');
assert(mcpClient.includes('readline.createInterface({ input: this._process.stdout })'), 'MCP client must parse stdio JSON-RPC response lines');
assert(mcpClient.includes('JSON.stringify(request) + "\\n"'), 'MCP client must send newline-delimited JSON-RPC requests to Node stdio MCP servers');
assert(mcpClient.includes('Node.js LTS') && mcpClient.includes('PATH'), 'MCP connection errors must explain Node/PATH remediation');
assert(sidebar.includes('Connecting...'), 'MCP sidebar must show clean Connecting... text');
assert(sidebar.includes('OK Connected'), 'MCP sidebar must show clean connected text');
assert(sidebar.includes('ERROR required'), 'MCP sidebar must show clean required-setting text');
assert(!/[�Ã]/.test(sidebar), 'MCP/chat sidebar must not contain mojibake replacement characters');

// RAG fallback: memory should not be dead when optional vector server is down.
assert(toolRegistry.includes('interface LocalRagRecord'), 'RAG fallback record type must exist');
assert(toolRegistry.includes('getLocalRagFilePath'), 'RAG fallback must write to a workspace-backed file');
assert(toolRegistry.includes('appendLocalRagRecord'), 'ingestRAG must be able to append local fallback records');
assert(toolRegistry.includes('queryLocalRag'), 'queryRAG must be able to search local fallback records');
assert(toolRegistry.includes('External RAG server note'), 'ingestRAG should report external server failure while preserving local memory');
assert(toolRegistry.includes('start rag_server.py for vector search'), 'queryRAG fallback should guide the user to optional vector search');
assert(!toolRegistry.includes('RAG server not available'), 'RAG tool must not return only a dead server-unavailable message');

// Studio media/file manager: enterprise asset CRUD and Sora/audio preview must remain wired.
for (const action of ['createFile', 'renameFile', 'duplicateFile', 'deleteFile']) {
  assert(studioProvider.includes(`message.type === "${action}"`) || studioProvider.includes(`type:'${action}'`), `Studio must wire ${action}`);
}
assert(studioProvider.includes("item.kind==='video'") && studioProvider.includes('video.controls=true'), 'Studio must render video preview with native controls');
assert(studioProvider.includes('video.volume=1'), 'Studio video preview must default to audible volume when browser policy permits');
assert(studioProvider.includes("item.kind==='audio'") && studioProvider.includes('audio.controls=true'), 'Studio must render audio preview with native controls');
assert(studioProvider.includes('Generate Sora Video') || studioProvider.includes('Sora'), 'Studio must expose Sora video workflow text');
assert(readme.includes('Azure Sora 2 video generation'), 'README must document Sora 2 video generation');
assert(readme.includes('azure:MAI-Image-2e'), 'README must document MAI image generation');
assert(readme.includes('MCP') && readme.includes('RAG'), 'README must document MCP/RAG recovery in this release');

process.stdout.write('mcp-rag-studio-regression: ok\n');
