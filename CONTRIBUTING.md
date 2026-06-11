# Contributing to Sentinel Coder One Studio

Thank you for helping improve Sentinel Coder One Studio.

Public repository:

- https://github.com/qubitpage/sentinel-coder-vscode

## What to contribute

Good contribution areas include:

- VS Code Desktop and VS Code Web compatibility fixes.
- Provider integrations and live model discovery improvements.
- Agentic Profile templates and cost/performance routing policies.
- Studio media/document workflows.
- Accessibility, keyboard navigation, and webview UI improvements.
- Documentation, examples, and troubleshooting notes.
- Security hardening and secret-leak prevention.
- Tests and packaging verification.

## Development setup

```powershell
git clone https://github.com/qubitpage/sentinel-coder-vscode.git
cd sentinel-coder-vscode
npm install
npm run compile
```

Package locally:

```powershell
npm run package:desktop
npm run package:web
npm run verify:web-manifest -- sentinel-coder-web-3.16.12.vsix
```

Install the desktop VSIX locally:

```powershell
code --install-extension sentinel-coder-3.16.12.vsix --force
```

## Pull request checklist

Before opening a pull request:

1. Keep secrets out of source, docs, media, and packaged output.
2. Run `npm run compile`.
3. Run `npm test` when changing provider routing, Agentic Profiles, model selectors, web compatibility, or packaging.
4. If touching web compatibility, run `npm run package:web` and `npm run verify:web-manifest -- sentinel-coder-web-3.16.12.vsix`.
5. If touching packaging/Marketplace docs, verify the packed VSIX includes the intended README/docs and excludes source/tests/scripts/scratch files.
6. Add or update documentation for user-visible behavior.
7. Explain the risk, test evidence, and compatibility impact in the PR description.

## Security

Do not open public issues containing API keys, tokens, connection strings, private endpoints, or customer data. Redact sensitive values before sharing logs.

## Code style

- Prefer minimal, targeted changes.
- Keep VS Code Web code browser-safe: no Node-only imports in the web entry bundle.
- Use VS Code APIs and webview-safe UI patterns.
- Do not use `window.alert`, `window.confirm`, or `window.prompt` inside webviews.
- Keep Content Security Policy strict for webviews.

## License

By contributing, you agree that your contribution is provided under the MIT license used by this project.
