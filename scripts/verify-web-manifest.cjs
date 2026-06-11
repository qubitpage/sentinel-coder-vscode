#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');
const vsix = process.argv[2] || path.join(root, `sentinel-coder-web-${pkg.version}.vsix`);
if (!fs.existsSync(vsix)) {
  console.error(`Missing VSIX: ${vsix}`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-web-vsix-'));
try {
  const sevenZip = process.platform === 'win32' ? 'tar.exe' : 'tar';
  cp.execFileSync(sevenZip, ['-xf', path.resolve(vsix), '-C', tmp], { stdio: 'pipe' });
  const manifestPath = path.join(tmp, 'extension', 'package.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Packed extension/package.json not found');
  const packed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const problems = [];
  if (packed.version !== pkg.version) problems.push(`version mismatch: ${packed.version} !== ${pkg.version}`);
  if (packed.browser !== './out/extensionWeb.js') problems.push(`browser must be ./out/extensionWeb.js, got ${packed.browser}`);
  if (!Array.isArray(packed.extensionKind) || !packed.extensionKind.includes('ui')) problems.push('extensionKind must include ui');
  if (!packed.capabilities?.virtualWorkspaces) problems.push('capabilities.virtualWorkspaces missing');
  if (!packed.capabilities?.untrustedWorkspaces) problems.push('capabilities.untrustedWorkspaces missing');
  if (!fs.existsSync(path.join(tmp, 'extension', 'out', 'extensionWeb.js'))) problems.push('out/extensionWeb.js missing from VSIX');
  if (fs.existsSync(path.join(tmp, 'extension', 'src'))) problems.push('src folder should not be shipped in VSIX');
  if (problems.length) {
    console.error('Web manifest verification failed:');
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: packed.version,
    browser: packed.browser,
    extensionKind: packed.extensionKind,
    virtualWorkspaces: packed.capabilities.virtualWorkspaces.supported,
    untrustedWorkspaces: packed.capabilities.untrustedWorkspaces.supported,
    vsix: path.resolve(vsix)
  }, null, 2)}\n`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
