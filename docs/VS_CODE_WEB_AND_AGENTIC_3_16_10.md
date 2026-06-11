# Sentinel Coder One Studio 3.16.10 - Web + Agentic Profile Release Notes

Status: implemented and verified for 3.16.10.

## What changed

3.16.10 combines the VS Code Web compatibility workflow with the Agentic Profile usability fixes requested during testing:

- The Marketplace package remains Web-compatible through `browser: ./out/extensionWeb.js` and `extensionKind: ["ui"]`.
- `npm run package:web` creates a web-target VSIX and `npm run verify:web-manifest` checks the packed manifest before publish.
- Agentic Profile setup no longer asks users to manually type model IDs for workers/reviewers.
- Settings > Agentic Profiles now uses live model dropdowns populated from configured/discovered providers.
- Worker and reviewer agents are added under a profile through multi-select model lists.
- The default worker selector is synchronized with the selected worker agents.
- Live provider discovery refreshes the dropdowns without erasing the open profile editor selections.
- Single-model mode remains direct and full-capability; orchestration activates only when an `Agentic:` profile is selected.
- During an active run the send button becomes **Add follow-up**, allowing users to queue more instructions instead of waiting.

## Required web-compatible publish workflow

```powershell
cd vscode-ext
npm run compile
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.10.vsix
npm run publish:web
```

Use `scripts/publish_web_with_local_pat.ps1` if the Marketplace PAT is stored in the secure local key file or `VSCE_PAT` environment variable. Never commit or print the token.

## Why this matters

The previous Marketplace symptom was:

> The 'Sentinel Coder One Studio' extension is not available in Visual Studio Code for the Web platform.

A web-compatible manifest and web-target publish are both required for vscode.dev. 3.16.10 keeps the web entry point and adds a repeatable packed-manifest verifier so maintainers can catch desktop-only packages before publishing.

## Known Web limitations

The extension can install and activate in vscode.dev, but full autonomous local actions still require VS Code Desktop. Browser-hosted extensions cannot run local shells, Docker, SSH, native MCP subprocesses, local Ollama, or unrestricted filesystem/media tooling.
