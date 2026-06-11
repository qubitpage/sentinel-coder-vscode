# Security and Release Checklist

Use this checklist before publishing Sentinel Coder One Studio to GitHub or the Visual Studio Marketplace.

---

## Non-negotiable rules

- Never commit API keys, access tokens, PATs, passwords, private endpoints, customer data, private prompts, local VS Code storage, or generated credentials.
- Never publish a VSIX without inspecting packaged contents.
- Never claim VS Code Web compatibility unless the web-target VSIX includes a browser entry point and passes manifest verification.
- Never run destructive commands without explicit user approval.

---

## File hygiene

Confirm `.vscodeignore` excludes:

- `src/**` when compiled output is used.
- `tests/**`.
- `scripts/**` unless a script is intentionally part of the shipped extension.
- `_inspect*/**` and other unpacked VSIX folders.
- `*.vsix` and `*.zip`.
- local scratch files such as `_*.js`, `_*.py`, `.tmp*`.
- local key files and environment files.

---

## Build and test gate

Run from the extension root:

```powershell
npm install
npm run compile
npm test
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-<version>.vsix
```

Then inspect the archives:

```powershell
npx vsce ls --no-dependencies
```

If using custom archive inspection, verify that forbidden paths are absent:

- `src/`
- `tests/`
- `scripts/`
- `_inspect*/`
- `_*.js`
- local key files

---

## Secret scan gate

Scan at minimum:

- `package.json`
- `README.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `docs/`
- `media/`
- `out/`
- generated VSIX contents after unpacking if possible

Look for:

- `sk-`, `ghp_`, `github_pat_`, `vsce`, `AZURE_`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- Bearer tokens
- connection strings
- private base URLs
- internal hostnames that should not be public

---

## Webview hardening gate

For webviews:

- Keep a strict Content Security Policy.
- Prefer `textContent`, DOM nodes, and escaped attributes.
- Avoid scattered `innerHTML` assignments.
- If Markdown or media previews require HTML fragments, route them through one auditable sanitized/trusted helper.
- Do not use `window.alert`, `window.confirm`, or `window.prompt`.

---

## Provider/tool routing gate

Before release:

- Verify normal single-model mode does not accidentally start Agentic orchestration.
- Verify `Agentic:` profiles trigger deterministic worker/reviewer preflight for substantial tasks.
- Verify provider capability routing avoids unsupported native tool parameters.
- Verify Azure/OpenAI-compatible, OpenRouter, Groq, Anthropic-style, and Ollama discovery paths degrade gracefully when offline or unauthorized.
- Verify context budgets prevent accidental 1M-token spend unless the user intentionally raises limits.

---

## Marketplace gate

Before publishing:

1. Bump `package.json` and `package-lock.json` to a new semver version.
2. Update `CHANGELOG.md`.
3. Ensure README describes the latest features.
4. Package desktop and web builds.
5. Publish the web-compatible target when updating vscode.dev compatibility.
6. Wait for Marketplace cache/indexing.
7. Verify the Marketplace page shows the new version.
8. Verify vscode.dev installability after cache refresh.

---

## Post-release verification

- Install the published version in VS Code Desktop.
- Check the Marketplace version and last updated time.
- Test chat with a normal model.
- Test an Agentic profile.
- Test Settings model dropdown refresh.
- Test Studio open/refresh.
- Test Web compatibility status command.
- File a GitHub release note or tag if desired.
