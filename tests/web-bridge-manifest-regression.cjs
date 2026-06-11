const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const web = fs.readFileSync(path.join(root, 'src', 'extensionWeb.ts'), 'utf8');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

assert(pkg.browser === './out/extensionWeb.js', 'package.json must declare browser web extension entry');
assert(Array.isArray(pkg.extensionKind) && pkg.extensionKind.includes('ui'), 'extensionKind must include ui for vscode.dev');
const commands = (pkg.contributes && pkg.contributes.commands || []).map(c => c.command);
assert(commands.includes('sentinel-coder.webStatus'), 'web status command must be contributed');
assert(commands.includes('sentinel-coder.configureWebRemoteBridge'), 'remote bridge configure command must be contributed');
assert(commands.includes('sentinel-coder.testWebRemoteBridge'), 'remote bridge test command must be contributed');
assert(/configureWebRemoteBridge/.test(web), 'web entry must register configureWebRemoteBridge');
assert(/testWebRemoteBridge/.test(web), 'web entry must register testWebRemoteBridge');
assert(/vscode\.env\.uiKind/.test(web), 'web entry must detect VS Code UI kind');
assert(/Remote Tool Bridge|Codespaces|Dev Tunnels|Remote/.test(web), 'web entry must explain web remote-tool strategy');
process.stdout.write('web-bridge-manifest-regression: ok\n');
