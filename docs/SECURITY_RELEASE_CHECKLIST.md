# Security and Release Checklist

Use this checklist before publishing Sentinel Coder One Studio to GitHub or the VS Code Marketplace.

---

## 1. Source safety

- [ ] No API keys, tokens, PATs, SSH keys, cookies, private URLs, customer data, or tenant IDs in source.
- [ ] No real secrets in docs, screenshots, generated media, or examples.
- [ ] `.vscodeignore` excludes tests, scripts, scratch files, old VSIXs, inspect folders, local workspaces, and temporary artifacts.
- [ ] Webview code avoids unsafe raw HTML insertion for untrusted strings.
- [ ] Webview Content Security Policy remains strict.
- [ ] No `window.alert`, `window.confirm`, or `window.prompt` inside webviews.
- [ ] Browser/web extension entry does not import Node-only modules.

---

## 2. Build and test gates

Required before Marketplace publish:

```powershell
cd vscode-ext
npm test
npx tsc -p ./
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-<version>.vsix
```

Additional recommended checks:

- Inspect packed VSIX contents.
- Run targeted secret scan on `src`, `media`, `docs`, `README.md`, `package.json`, `CHANGELOG.md`, and VSIX contents.
- Install the VSIX locally and verify extension activation.
- Test `sentinel-coder.webStatus` in web/desktop mode.
- Confirm the model selector shows Agentic Modes, Most Used, and provider-grouped models.
- Confirm Agentic Profile editor uses dropdowns and preserves selections after model refresh.
- Confirm a normal single-model selection does not spawn sub-agents.
- Confirm a real `Agentic:` profile shows sub-agent usage telemetry for substantial tasks.

---

## 3. Provider and secret handling

- [ ] Marketplace PAT is passed via environment variable only.
- [ ] PAT is never echoed in logs.
- [ ] Any local `api_keys.txt` file is outside the repository or ignored.
- [ ] Provider keys are never committed.
- [ ] Screenshots redact provider keys and private endpoints.
- [ ] Donation QR encodes only the public PayPal donation link.

---

## 4. Versioning and Marketplace

- [ ] `package.json` version is higher than the latest Marketplace version.
- [ ] `package-lock.json` version matches `package.json`.
- [ ] `CHANGELOG.md` has a top entry for the new version.
- [ ] `README.md` has Marketplace-visible release notes and docs links.
- [ ] Desktop and web VSIXs are packaged from the same verified source.
- [ ] Web VSIX includes `browser`, `extensionKind`, and `out/extensionWeb.js`.
- [ ] Published Marketplace version is verified after indexing/cache delay.

---

## 5. GitHub publishing

Before push:

```powershell
git status --short
git diff --stat
git diff -- . ':!*.vsix'
```

Commit only:

- Source files intended for release.
- Public docs.
- Public assets such as icons, diagrams, donation QR if safe.
- Tests and package scripts if intentionally part of the repository.

Do not commit:

- Local `.vscode` private settings.
- `node_modules`.
- Old generated VSIXs.
- `_inspect_*` folders.
- Scratch scripts.
- API key files.
- Personal workspace storage.

---

## 6. Hard critique before release

Ask these questions:

1. Can a first-time user understand how to install, configure providers, pick models, and troubleshoot failures?
2. Does the README honestly explain VS Code Web limitations?
3. Are free-model profiles clearly labeled as rate-limited and quality-variable?
4. Are expensive models protected by cost-smart routing and context budgets?
5. Does the package prove web compatibility instead of only claiming it?
6. Does every new feature have at least one static/regression/compile/package check?
7. Would a public security reviewer find obvious secret leaks or unsafe webview sinks?
8. Is the donation request transparent, optional, and aligned with open-source maintenance?

If the answer is no, fix before publish.
