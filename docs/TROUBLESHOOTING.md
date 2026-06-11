# Troubleshooting

## Marketplace still shows an old version

Microsoft Marketplace can cache extension metadata. Verify:

1. `package.json` version.
2. Built VSIX manifest version.
3. `vsce publish` output.
4. Marketplace public page after indexing delay.
5. VS Code Extensions panel after reload.

If the version already exists, bump the patch version and publish again.

## vscode.dev says extension is not available for Web

Check the VSIX manifest includes:

- `browser`: `./out/extensionWeb.js`.
- `extensionKind`: compatible UI/web behavior.
- Web-safe activation path.
- No Node-only imports from `extensionWeb.ts`.
- `npm run verify:web-manifest` passes.

Publish the web-target package and allow Marketplace cache refresh.

## A provider model fails with unsupported operation

Sentinel uses operation-aware native tool routing, but provider APIs change. Try:

1. Refresh provider catalog.
2. Test the model in single-model Ask mode.
3. Disable native tools for that provider/model if needed.
4. Use another model for tool-heavy Agent mode.
5. Report the provider/model ID and error on GitHub Issues without API keys.

## Models do not appear in dropdowns

- Confirm provider key/base URL.
- Confirm provider account has model access.
- Press refresh/discover.
- Check provider rate limits.
- For Azure, confirm deployments are chat-capable.
- For OpenRouter/Groq, confirm the catalog endpoint is reachable.

## Agentic profile does not orchestrate

- Ensure you selected an `Agentic:` profile, not a normal model.
- Use Agent mode for substantial multi-step tasks.
- Check worker/reviewer pools are populated.
- Check turn footer for orchestrator/sub-agent usage.
- Free providers may be rate-limited; choose fallback workers.

## Terminal/Docker/SSH unavailable in browser

This is a VS Code Web platform limitation. Use:

- VS Code Desktop.
- Remote SSH/Codespaces/dev container.
- Sentinel Remote Tool Bridge with authentication.

## Media generation fails

- Confirm the media deployment exists.
- Confirm quota and region availability.
- Check prompt safety restrictions.
- For transcription, configure `SPEECHMATICS_API_KEY` or the git-ignored API keys file.

## Chat scroll jumps to bottom while reading

Sentinel includes reader-safe scroll behavior. If it regresses:

- Scroll up manually during a run.
- Use **Jump to latest** when ready.
- Report reproduction steps and extension version.

## Before filing an issue

Include:

- Extension version.
- VS Code version and Desktop/Web environment.
- Provider name/model ID, but never API keys.
- Relevant sanitized error message.
- Steps to reproduce.
