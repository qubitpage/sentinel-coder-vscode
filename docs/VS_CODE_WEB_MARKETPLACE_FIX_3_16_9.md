# VS Code Web / vscode.dev Marketplace Fix - Sentinel Coder One Studio 3.16.9

Status: implemented for 3.16.9.

## Problem

vscode.dev showed:

> The 'Sentinel Coder One Studio' extension is not available in Visual Studio Code for the Web platform.

VS Code for the Web can only install extensions that the Marketplace recognizes as Web-compatible. A desktop extension that only exposes a Node.js `main` entry, or a package that was published without the Web-compatible manifest/artifact, can be blocked in vscode.dev even when it works in Desktop.

## Microsoft requirements applied

From the official VS Code Web Extension guide and VS Code for the Web docs:

- Web extensions run in the browser/web extension host.
- The web host uses the `browser` entry in `package.json`, not the desktop `main` entry.
- The browser entry must not import Node-only modules such as `fs`, `path`, `child_process`, local terminals, SSH, Docker, local Ollama, native MCP subprocesses, or unrestricted filesystem/server APIs.
- Web/virtual workspace support must be declared honestly.

## 3.16.9 solution

Sentinel now ships and verifies a browser-safe compatibility package path:

- `package.json` keeps `browser: ./out/extensionWeb.js`.
- `extensionKind: ["ui"]` lets vscode.dev activate Sentinel in the Web extension host.
- `src/extensionWeb.ts` imports only `vscode`, registers the contributed commands, and renders safe placeholder Chat/Studio views explaining Desktop-only limitations.
- `capabilities.virtualWorkspaces` and `capabilities.untrustedWorkspaces` are declared as `limited`.
- `npm run package:desktop` and `npm run package:web` create deterministic desktop and web VSIX artifacts through `vsce`.
- `scripts/verify-web-manifest.cjs` inspects a packed VSIX and fails if the Web manifest requirements are missing.

## Required release workflow

Run this before publishing:

```powershell
cd vscode-ext
npm run compile
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.9.vsix
```

Publish the web-compatible artifact/path:

```powershell
cd vscode-ext
npm run publish:web
```

If the Marketplace still shows the extension as unavailable in vscode.dev, the most likely cause is that an older desktop-only VSIX is still the published Marketplace version. Publish 3.16.9 with the Web target and wait for Marketplace indexing/cache refresh.

## Important limitation

This fix makes Sentinel installable and activatable in vscode.dev. Full autonomous agent mode still requires VS Code Desktop because the browser sandbox cannot run local terminals, Docker, SSH, local Ollama, unrestricted filesystem operations, native MCP subprocesses, or local media tooling.
