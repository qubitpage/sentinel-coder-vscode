# Security and Enterprise Hardening

This document describes Sentinel Coder One Studio's security posture and the checks maintainers should run before publishing.

## Security principles

- No hardcoded secrets.
- Provider keys stored in VS Code SecretStorage, environment variables, or git-ignored files.
- Webviews avoid raw `innerHTML` sinks for untrusted content.
- Tool execution is explicit and approval-gated.
- Browser mode uses a remote bridge for operations unavailable in VS Code Web.
- Packaged VSIX artifacts exclude source scratch files, tests, scripts, and local inspection folders.

## Pre-publish checklist

Run before GitHub push or Marketplace publish:

1. `npm test`
2. `npx tsc -p ./`
3. `npm run package:desktop`
4. `npm run package:web`
5. `npm run verify:web-manifest`
6. Inspect VSIX archives for forbidden paths.
7. Run Sentinel firewall scan on `src`, `media`, `package.json`, `README.md`, and `docs`.
8. Search for secret patterns: `sk-`, `ghp_`, `vsce_pat`, `AIza`, `xox`, `password=`, `api_key=`.
9. Confirm `.vscodeignore` excludes `scripts/**`, `tests/**`, `_*.js`, `_*.py`, `*.vsix`, inspection folders, and local workspaces.
10. Publish only after all checks pass.

## Webview safety

High-risk patterns:

- Assigning untrusted strings to `innerHTML`.
- Building attributes with unescaped provider/model names.
- Rendering file paths/previews without escaping.
- Loading external scripts/styles in webviews.

Required patterns:

- Use `textContent` for text.
- Use DOM APIs for dynamic UI.
- Escape attributes.
- Centralize trusted/sanitized Markdown rendering.
- Keep Content-Security-Policy strict.

## Tool safety

Potentially dangerous operations:

- Terminal commands.
- File deletion/overwrite.
- SSH commands.
- Docker commands.
- Git push/publish.
- Remote Tool Bridge execution.

Recommended enterprise settings:

- Approval mode: `default` for production repos.
- Require user approval for destructive commands.
- Run builds/tests before commit.
- Run firewall scans before push.
- Keep audit logs and turn footers showing model/sub-agent usage.

## VS Code Web security

Browser mode cannot access local system tools directly. Do not work around this by embedding secrets or exposing unauthenticated bridges.

Remote Tool Bridge requirements:

- HTTPS.
- Authentication.
- Per-workspace authorization.
- Command allowlists.
- Audit logging.
- Timeouts and output limits.
- No long-lived secrets in browser storage.

## Known limitations

- Sentinel can reduce but not eliminate AI mistakes.
- Free models can be rate-limited and inconsistent.
- Provider metadata can be incomplete or stale.
- Marketplace indexing may lag after publish.
- End-to-end UI behavior inside VS Code Web should be manually smoke-tested after Marketplace propagation.

## Incident response

If a secret is accidentally committed:

1. Revoke it immediately.
2. Rotate provider credentials.
3. Remove it from Git history if required.
4. Publish a patched extension if the secret reached a VSIX.
5. Document the incident and add a regression scan.
