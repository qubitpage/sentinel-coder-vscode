# Security and Release Hardening Checklist

This checklist is intended for maintainers before pushing to GitHub or publishing Sentinel Coder One Studio to the Visual Studio Marketplace.

---

## 1. File-by-file review

Review changed files by category:

- `src/**` - TypeScript extension host logic.
- `media/**` - webview JavaScript/CSS/HTML assets.
- `out/**` - compiled output included in VSIX.
- `docs/**` and `README.md` - Marketplace/GitHub public documentation.
- `package.json` and `package-lock.json` - extension manifest, web entry, scripts, versions.
- `.vscodeignore` - package exclusion rules.
- `assets/**` - public icons/images only.

Reject release if any file contains private keys, private endpoints, local-only workspace paths, test scratch files, or unreviewed generated artifacts.

---

## 2. Secret scanning

Run scanner/firewall checks against:

- `src`.
- `media`.
- `docs`.
- `README.md`.
- `CONTRIBUTING.md`.
- `CHANGELOG.md`.
- `package.json`.
- Packed VSIX contents.

Search for patterns such as:

- `sk-`, `api_key`, `apikey`, `bearer`, `token`, `connectionString`.
- Azure/OpenAI/GitHub/Groq/OpenRouter/Anthropic key-like values.
- Private `.env` content.
- Local `api_keys.txt` references.

The public repository must not contain your configured local VS Code profile or real provider keys.

---

## 3. Webview hardening

For webview assets:

- Keep Content Security Policy strict.
- Prefer DOM construction and `textContent` over raw HTML.
- Avoid `window.alert`, `window.confirm`, and `window.prompt`.
- Treat provider/model names, file paths, chat content, and tool output as untrusted.
- If sanitized Markdown/media rendering is required, centralize the trusted fragment path and escape everything else.
- Re-run scans after webview changes.

---

## 4. VS Code Web compatibility

Verify:

- `package.json` has a `browser` entry.
- `out/extensionWeb.js` is included in the VSIX.
- Desktop-only imports are not loaded by the web entry.
- Web commands show bridge/Desktop guidance instead of failing.
- The web-target VSIX passes the web manifest verifier.

---

## 5. Build/test/package evidence

Minimum release checks:

```powershell
npm run compile
npm test
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-<version>.vsix
```

Also inspect VSIX contents and confirm excluded folders are not shipped:

- `src/**` should not be packed if compiled output is used.
- `tests/**` should not be packed.
- `scripts/**` should not be packed.
- `_inspect*`, `_agent*`, scratch files, and local workspaces should not be packed.

---

## 6. GitHub release hygiene

Before pushing:

- Confirm branch and remote.
- Review `git diff`.
- Confirm only intended files changed.
- Confirm generated images/docs are public-safe.
- Commit with a clear release message.
- Push to the public repository only after scans pass.

---

## 7. Marketplace publish hygiene

Before publishing:

- Bump `package.json` and `package-lock.json` consistently.
- Update `CHANGELOG.md`.
- Update Marketplace-visible `README.md`.
- Package desktop and web artifacts.
- Publish the web-compatible package when targeting vscode.dev availability.
- Verify Marketplace version after indexing/caching delay.

---

## 8. Enterprise stability principles

- Prefer explicit capability detection over optimistic provider assumptions.
- Preserve single-model mode as deterministic and direct.
- Keep Agentic orchestration opt-in and auditable.
- Bound context by user-configurable budgets.
- Keep worker output non-authoritative until verified by the main model and real tools.
- Fail closed for secrets and destructive operations.
- Report actual command/test evidence, not assumptions.
