# File-by-File Review Guide

This guide explains how maintainers should review Sentinel Coder One Studio before release.

It does not claim that every line can be mathematically proven correct. Instead, it defines a practical enterprise review process for every file category, every public artifact, and every high-risk behavior.

---

## 1. Review categories

### `package.json`

Check:

- Version matches release target.
- `main` and `browser` entries exist and point to compiled files.
- `extensionKind` and web workspace capabilities are correct.
- Commands and views match implementation.
- README/Marketplace description is current.
- Scripts exist for compile, tests, package desktop, package web, and web manifest verification.

### `package-lock.json`

Check:

- Version matches `package.json`.
- Dependency changes are intentional.

### `src/**`

Check:

- No hardcoded secrets.
- Provider APIs read keys from secure settings/environment/secret storage.
- Tool execution has approval and safety gates.
- Web-specific code does not import Node-only modules.
- Agentic orchestration is opt-in.
- Single-model mode remains direct.
- Provider capability routing is conservative.

### `media/**`

Check:

- No unsafe scattered `innerHTML` assignments.
- Dynamic data is escaped or inserted through DOM APIs.
- CSP remains strict.
- No browser blocking dialogs (`alert`, `confirm`, `prompt`).
- Chat scrolling does not force users to the bottom when reading history.

### `out/**`

Check:

- Compiled output reflects current source.
- No source maps or debug artifacts if not intended.
- No secrets or local paths.

### `docs/**`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`

Check:

- Docs are accurate and version-aligned.
- No private screenshots/configuration.
- Donation links are public and intentional.
- Contribution/security instructions warn users not to post secrets.

### `assets/**`

Check:

- Only public-safe images/icons.
- No screenshots containing keys or private data.
- Files are reasonably sized.

### `.vscodeignore`

Check that VSIX excludes:

- `src/**` if only compiled output is shipped.
- `tests/**`.
- `scripts/**`.
- Scratch `_*.js`, `_*.py`, `_inspect*` folders.
- Local workspaces and generated temporary files.
- Existing old VSIX archives.

---

## 2. Behavioral review checklist

For each feature touched:

1. Identify user-facing behavior.
2. Identify trusted/untrusted inputs.
3. Identify provider/network calls.
4. Identify filesystem or command execution.
5. Check approval behavior.
6. Check Web vs Desktop behavior.
7. Add or run targeted tests.
8. Run compile/package verification.
9. Update docs.
10. Re-run secret scan.

---

## 3. Minimum release evidence

A release note should be supported by real evidence:

- Compile exit 0.
- Tests exit 0.
- Desktop VSIX packages successfully.
- Web VSIX packages successfully.
- Web manifest verifier passes.
- Firewall/secret scan clean or findings documented and fixed.
- VSIX content inspection confirms no forbidden files.

---

## 4. Self-critique gate

Before publishing, maintainers should answer:

- What can fail in production?
- What is expensive if misused?
- What might leak data?
- What is different in VS Code Web?
- What behavior is provider-specific?
- What docs would a new user need to avoid mistakes?
- What should be tested next?

If any answer is unclear, improve code/docs/tests before publishing.
