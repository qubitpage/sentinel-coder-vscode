# Security and Release Checklist

Use this checklist before publishing Sentinel Coder One Studio to GitHub or the Visual Studio Marketplace.

Status: updated for 3.16.18.

---

## Non-negotiable release criteria

A release must not be published unless every item below is true:

1. TypeScript compile passes.
2. Regression tests pass.
3. Desktop VSIX builds successfully.
4. Web VSIX builds successfully.
5. Web manifest verification passes for the fresh web VSIX.
6. Firewall scans are clean.
7. Secret scans are clean.
8. Archive inspection confirms no secrets, scratch files, source test folders, scripts, `_inspect*/` folders, temporary files, or generated declarations are packaged unintentionally.
9. Marketplace README clearly explains setup, provider keys, VS Code Web limits, Remote Tool Bridge strategy, contribution links, support, and donation.
10. Public docs contain no broken links to deleted duplicate docs.
11. Marketplace-facing text is free of mojibake-prone corruption, replacement characters, and unsafe copied punctuation in the landing headline.
12. GitHub state is committed and pushed before or immediately after Marketplace publish.

If any gate fails, stop the publish, patch the root cause, rerun the gate, and only then continue.

---

## Secret and credential rules

- Never commit API keys, access tokens, PATs, passwords, private endpoints, customer data, private prompts, local VS Code storage, generated credentials, or bridge bearer tokens.
- Never print publishing tokens in logs.
- Use environment variables, VS Code secret storage, or local git-ignored files for credentials.
- Documentation examples must use placeholder syntax that cannot be mistaken for real secrets.

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
- generated declaration files if they are not intentionally shipped.

Also confirm the GitHub repo does not keep obsolete unpacked VSIX inspection folders or duplicate docs that confuse the landing page.

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

If `npm test` already runs compile, still keep the compile gate visible in release logs or CI output.

---

## Archive inspection gate

Inspect both desktop and web VSIX artifacts.

Required checks:

- Manifest version matches `package.json`.
- Web VSIX contains browser-compatible metadata and `browser` entry point.
- Desktop/universal VSIX contains the desktop `main` entry point.
- Forbidden paths are absent:
  - `src/`
  - `tests/`
  - `scripts/`
  - `_inspect*/`
  - `_*.js`
  - `_*.py`
  - `.tmp*`
  - local key files
  - old unpacked packages
  - private notes
- Packaged text files do not contain token-like strings, secret assignment examples, or private local paths.

Suggested command:

```powershell
npx vsce ls --no-dependencies
```

For strict release builds, unpack the VSIXs to a temporary ignored folder and run the same token/link checks on the unpacked contents.

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
- unpacked VSIX contents

Look for:

- OpenAI-style secret-key prefixes.
- GitHub classic and fine-grained personal-access-token prefixes.
- VS Marketplace publishing-token references.
- Azure credential variable names.
- Provider key setting names for OpenAI, Anthropic, Groq, and OpenRouter.
- Bearer-token examples.
- Connection strings.
- Private base URLs.
- Internal hostnames that should not be public.

Expected docs may mention provider setting names, but they must not contain real values, raw token prefixes, or assignment-style fake secrets that scanners could confuse for real credentials.

---

## Webview hardening gate

For webviews:

- Keep a strict Content Security Policy.
- Prefer `textContent`, DOM nodes, and escaped attributes.
- Avoid scattered `innerHTML` assignments.
- If Markdown or media previews require HTML fragments, route them through one auditable sanitized/trusted helper.
- Do not use `window.alert`, `window.confirm`, or `window.prompt`.
- Add DOM tests for dangerous strings before changing renderer paths.

---

## Provider/tool routing gate

Before release:

- Verify normal single-model mode does not accidentally start Agentic orchestration.
- Verify `Agentic:` profiles trigger deterministic worker/reviewer preflight for substantial tasks.
- Verify Agentic worker failure or 429 does not collapse the whole workflow when other models can continue.
- Verify provider capability routing avoids unsupported native tool parameters.
- Verify Azure/OpenAI-compatible, OpenRouter, Groq, Anthropic-style, and Ollama discovery paths degrade gracefully when offline or unauthorized.
- Verify context budgets prevent accidental 1M-token spend unless the user intentionally raises limits.
- Verify the categorized model selector groups Agentic modes, most-used modes/models, and provider sections with free/free-tier options before paid where known.

---

## VS Code Web and Remote Tool Bridge gate

Before claiming web compatibility:

- Web target package builds.
- `browser` entry point is present.
- Web manifest verification passes.
- Web status command honestly reports browser limitations.
- Docs explain that pure browser vscode.dev cannot directly run local terminal, SSH, Docker, native MCP, local Ollama, or media binaries.
- Docs explain alternatives:
  - VS Code Remote SSH
  - WSL
  - Dev Containers
  - Codespaces
  - Dev Tunnels
  - trusted HTTPS Sentinel Remote Tool Bridge
- Remote Tool Bridge docs cover authentication, request schema, allowed operations, audit logs, rate limits, and deployment strategy.

---

## Documentation gate

Before publishing:

- `README.md` explains install/setup, provider keys, model selector, Agentic Profiles, Studio/media/document tools, VS Code Web limits, Remote Tool Bridge, contribution, support, and donation.
- `CHANGELOG.md` has the new version at the top.
- `docs/README.md` links only canonical docs.
- Duplicate obsolete docs are removed or redirected.
- Marketplace-facing text is ASCII-safe if rendering pipelines show encoding problems.
- Broken-link scan passes for deleted documents.

---

## Marketplace and public documentation gate

Before publishing:

1. Bump `package.json` and `package-lock.json` to a new semver version.
2. Update `CHANGELOG.md` with the exact version and release summary.
3. Ensure `README.md` describes setup, provider keys, model selector, Agentic Profiles, Studio/media tools, VS Code Web limits, Remote Workspace and Remote Tool Bridge behavior, contribution links, support, and donation.
4. Ensure `docs/README.md` links one canonical guide per topic and does not point to deleted duplicate docs.
5. Confirm Marketplace-facing Markdown is ASCII-safe and contains no mojibake or replacement characters.
6. Package desktop and web builds from the verified tree.
7. Publish the web-compatible target when updating vscode.dev compatibility.
8. Publish the universal/desktop target.
9. Wait for Marketplace cache/indexing.
10. Verify the Marketplace page shows the new version and clean rendering.
11. Verify vscode.dev installability after cache refresh.

---

## Post-release verification

- Install the published version in VS Code Desktop.
- Check the Marketplace version and last updated time.
- Test chat with a normal model and confirm it does not trigger Agentic orchestration.
- Test an Agentic profile and confirm worker/reviewer preflight, fallback behavior, and model-usage telemetry.
- Test Settings model dropdown refresh and Agentic worker/reviewer dropdowns.
- Test categorized model selector grouping and free/free-tier ordering.
- Test Studio open/refresh and generated asset rendering.
- Test multi-session `runCommand` behavior when two tasks run in separate sessions.
- Test Remote Workspace command routing inside an already-authenticated VS Code Remote SSH, Codespaces, Dev Container, WSL, or Tunnel session.
- Test Web compatibility status command and vscode.dev installability.
- Confirm GitHub and Marketplace landing pages render without mojibake.
- File a GitHub release note or tag if desired.
/Dev Container environment.
- File a GitHub release note or tag if desired.
