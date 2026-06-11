# Remote Workspace Tools: VS Code Remote SSH, Containers, WSL, Codespaces, and Tunnels

Sentinel Coder One Studio can now distinguish three execution environments:

1. **Local VS Code Desktop** - commands run on your local workstation.
2. **VS Code Remote workspace host** - commands run on the already-connected remote server/container/WSL/Codespace/Tunnel where the VS Code extension host is running.
3. **Pure browser vscode.dev/github.dev** - pure browser vscode.dev/github.dev extension code cannot spawn shells directly; use VS Code Remote or a trusted HTTPS Remote Tool Bridge.

## New tool: `remoteWorkspaceCommand`

Use `remoteWorkspaceCommand` when you are already connected to a server through VS Code Remote Explorer / Remote SSH, Dev Containers, WSL, Codespaces, or Dev Tunnels.

The tool:

- runs commands on the current VS Code remote workspace extension host,
- reuses VS Code's existing authenticated remote session,
- does **not** ask for SSH private keys,
- does **not** store SSH keys,
- refuses to pretend it is remote when no remote workspace is active unless a user/developer explicitly allows local fallback,
- reports the detected host context (`remoteName`, URI scheme, workspace path, and platform) in tool output.

## Recommended workflow

1. Connect to your server in VS Code using **Remote Explorer** or **Remote SSH**.
2. Open the project folder on that remote host.
3. Install/enable Sentinel Coder One Studio in that remote workspace if VS Code asks.
4. Ask Sentinel to diagnose, edit, build, test, or restart services.
5. Sentinel should prefer `remoteWorkspaceCommand` for server-local commands.

## Parallel sessions and memory guardrails

`runCommand` and `remoteWorkspaceCommand` accept an optional `sessionId`. Use separate names for independent work so one long command does not block the rest of the agent:

- `server-build` for production builds,
- `server-tests` for test suites,
- `server-logs` for long-running log tails,
- `server-shell` for short diagnostics.

Sentinel keeps each named terminal session persistent, so `cd`, activated virtual environments, and exported variables stay local to that session. To protect your workstation or remote host from out-of-memory pressure, Sentinel also applies these settings:

- `sentinelCoder.terminalMaxSessions` - maximum persistent terminal sessions kept alive at once.
- `sentinelCoder.terminalMinFreeMemoryMb` - minimum free memory required before opening a new terminal session.
- `sentinelCoder.terminalIdleCleanupSeconds` - idle cleanup period for non-default sessions.

If a session is busy, ask Sentinel to continue in another `sessionId` instead of waiting on the blocked one. If the memory guard refuses a new session, close idle sessions, raise the limit only on a capable host, or reuse an existing idle session.

Example requests:

- "Check why this Node service fails on this remote server and fix it."
- "Run the build on the Remote SSH workspace and patch the TypeScript errors."
- "Inspect Nginx config in this remote workspace and propose a safe fix."
- "Run `docker ps` on the connected Dev Container host and diagnose the failing service."

## Difference from `sshCommand`

Use `remoteWorkspaceCommand` for the server you are **already connected to in VS Code**.

Use `sshCommand` only when you need Sentinel to connect to a **different** host outside the active VS Code Remote session, and only with normal SSH configuration/agent/keychain practices. Do not paste private keys into chat.

## Security rules

- Sentinel does not need your SSH private key when VS Code already has a remote session.
- Never paste private keys, passwords, cloud tokens, or `.env` secrets into chat.
- Keep tool approval enabled for destructive operations.
- Treat production commands as dangerous: build first, inspect diffs, run tests, then restart/deploy.
- In Restricted Mode or untrusted workspaces, autonomous terminal/file operations should remain limited.

## vscode.dev and browser mode

A browser tab cannot directly spawn `ssh`, `docker`, local shells, native MCP servers, or local Ollama. To get full server-side tools from vscode.dev:

- connect vscode.dev to a Codespace / Dev Tunnel / remote workspace where Sentinel runs on the workspace host, or
- configure a trusted HTTPS Sentinel Remote Tool Bridge for approved operations.

This is a platform security boundary, not an artificial Sentinel limitation.
