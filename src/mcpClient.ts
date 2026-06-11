import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as readline from "readline";

// ── MCP Protocol Types (JSON-RPC 2.0) ──────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  /** Human-friendly description shown in the UI. */
  description?: string;
  /** Names of env vars that MUST be set before the server can start. */
  requires?: string[];
  /** Where this config came from: built-in default, user settings, or imported from VS Code. */
  source?: "builtin" | "user" | "vscode";
}

// ── MCP Server Connection ──────────────────────────────────────────────────

class McpServerConnection {
  private _process: child_process.ChildProcess | null = null;
  private _requestId = 0;
  private _pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private _tools: McpToolDefinition[] = [];
  private _initialized = false;
  private _rl: readline.Interface | null = null;
  private _lastError = "";

  constructor(
    public readonly config: McpServerConfig,
    private readonly _outputChannel: vscode.OutputChannel
  ) {}

  get tools(): McpToolDefinition[] { return this._tools; }
  get isConnected(): boolean { return this._initialized && this._process !== null && !this._process.killed; }
  get name(): string { return this.config.name; }
  get lastError(): string { return this._lastError; }

  async start(): Promise<void> {
    if (this._process && !this._process.killed) return;

    this._lastError = "";

    // Validate required env vars before spawning to give a clear, actionable error.
    const missing = (this.config.requires || []).filter(
      (k) => !((this.config.env || {})[k] || "").trim()
    );
    if (missing.length > 0) {
      this._lastError = `Missing required setting${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Set ${missing.length > 1 ? "them" : "it"} in the field below, then Connect.`;
      this._outputChannel.appendLine(`[MCP] ${this.config.name}: ${this._lastError}`);
      throw new Error(this._lastError);
    }

    const command = String(this.config.command || "").trim();
    const mcpArgv = Array.isArray(this.config.args) ? this.config.args.map((arg) => String(arg)) : [];
    const commandLooksSafe = /^[A-Za-z0-9_.-]+(?:\.cmd|\.exe|\.bat)?$/.test(command) || path.isAbsolute(command);
    if (!command || !commandLooksSafe || /[\r\n\u0000<>|&;]/.test(command)) {
      this._lastError = "Invalid MCP command. Use an executable name such as npx/node/python, or an absolute executable path.";
      throw new Error(this._lastError);
    }
    if (mcpArgv.some((arg) => /[\r\n\u0000]/.test(arg))) {
      this._lastError = "Invalid MCP argument.";
      throw new Error(this._lastError);
    }

    this._outputChannel.appendLine(`[MCP] Starting server: ${this.config.name} -> ${command} ${mcpArgv.join(" ")}`);

    try {
      this._process = child_process.spawn(command, mcpArgv, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...this.config.env },
        shell: false,
        windowsHide: true,
      });

      this._process.on("error", (err) => {
        const hint = /ENOENT|not recognized|not found/i.test(err.message)
          ? ` — '${this.config.command}' was not found. Install Node.js (which provides npx) and ensure it is on your PATH.`
          : "";
        this._lastError = err.message + hint;
        this._outputChannel.appendLine(`[MCP] ${this.config.name} error: ${this._lastError}`);
        this._initialized = false;
      });

      this._process.on("exit", (code) => {
        this._outputChannel.appendLine(`[MCP] ${this.config.name} exited with code ${code}`);
        if (!this._initialized && code !== 0 && !this._lastError) {
          this._lastError = `Server process exited with code ${code} before it finished starting. Check the Sentinel Coder output channel for details.`;
        }
        this._initialized = false;
        this._process = null;
      });

      // Parse stdout line-by-line for JSON-RPC responses
      if (this._process.stdout) {
        this._rl = readline.createInterface({ input: this._process.stdout });
        this._rl.on("line", (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const msg: JsonRpcResponse = JSON.parse(trimmed);
            if (msg.id !== undefined && this._pendingRequests.has(msg.id)) {
              const pending = this._pendingRequests.get(msg.id)!;
              this._pendingRequests.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(`MCP error: ${msg.error.message}`));
              } else {
                pending.resolve(msg.result);
              }
            }
          } catch {
            // Non-JSON output, log it
            if (trimmed.length > 0) {
              this._outputChannel.appendLine(`[MCP] ${this.config.name} stdout: ${trimmed}`);
            }
          }
        });
      }

      // Log stderr
      if (this._process.stderr) {
        const stderrRl = readline.createInterface({ input: this._process.stderr });
        stderrRl.on("line", (line) => {
          if (line.trim()) {
            this._outputChannel.appendLine(`[MCP] ${this.config.name} stderr: ${line}`);
            if (!this._initialized) this._lastError = line.trim().slice(0, 240);
          }
        });
      }

      // Initialize + discover tools
      await this._sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "sentinel-coder", version: "3.2.0" },
      });
      this._initialized = true;

      // Send initialized notification
      this._sendNotification("notifications/initialized", {});

      // List tools
      const toolsResult = await this._sendRequest("tools/list", {}) as { tools?: McpToolDefinition[] };
      this._tools = toolsResult?.tools || [];
      this._outputChannel.appendLine(`[MCP] ${this.config.name}: ${this._tools.length} tools discovered`);

    } catch (err) {
      this._lastError = this._lastError || (err instanceof Error ? err.message : String(err));
      this._outputChannel.appendLine(`[MCP] Failed to start ${this.config.name}: ${this._lastError}`);
      this.stop();
      throw new Error(this._lastError);
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    if (!this.isConnected) throw new Error(`MCP server ${this.config.name} not connected`);

    const result = await this._sendRequest("tools/call", { name: toolName, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    let text = "";
    if (result?.content) {
      text = result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
    } else {
      text = JSON.stringify(result, null, 2);
    }
    // Per the MCP spec a tool can report a handled execution error via isError.
    // Surface it as a thrown error so the agent treats it as a failure (and can
    // retry/adjust) instead of mistaking the error text for a successful result.
    if (result?.isError) {
      throw new Error(text || "MCP tool reported an error");
    }
    return text;
  }

  stop(): void {
    if (this._rl) { this._rl.close(); this._rl = null; }
    if (this._process && !this._process.killed) {
      this._process.kill("SIGTERM");
      setTimeout(() => { if (this._process && !this._process.killed) this._process.kill("SIGKILL"); }, 3000);
    }
    this._process = null;
    this._initialized = false;
    this._tools = [];
    for (const [, pending] of this._pendingRequests) {
      pending.reject(new Error("Server stopped"));
    }
    this._pendingRequests.clear();
  }

  private _sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._process?.stdin) {
        reject(new Error("No stdin")); return;
      }
      const id = ++this._requestId;
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this._pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        if (this._pendingRequests.has(id)) {
          this._pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);

      // Clear timeout when resolved
      const originalResolve = resolve;
      const originalReject = reject;
      this._pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timeout); originalResolve(v); },
        reject: (e) => { clearTimeout(timeout); originalReject(e); },
      });

      this._process.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  private _sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this._process?.stdin) return;
    const notification = { jsonrpc: "2.0", method, params };
    this._process.stdin.write(JSON.stringify(notification) + "\n");
  }
}

// ── MCP Manager ────────────────────────────────────────────────────────────

export class McpManager {
  private _servers = new Map<string, McpServerConnection>();

  constructor(private readonly _outputChannel: vscode.OutputChannel) {}

  /** Get default server configs from workspace settings, or provide built-in defaults */
  getDefaultConfigs(): McpServerConfig[] {
    const config = vscode.workspace.getConfiguration("sentinelCoder");
    const userConfigs = config.get<McpServerConfig[]>("mcpServers", []);

    // Built-in, ready-to-use servers. filesystem + memory need no credentials
    // (free, work out of the box); postgres + brave-search need one setting each.
    const builtins: McpServerConfig[] = [
      {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", this._getWorkspacePath()],
        enabled: false,
        description: "Read/write files in the current workspace folder. Free — no API key needed.",
        source: "builtin",
      },
      {
        name: "memory",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        enabled: false,
        description: "A persistent knowledge graph the agent can store and recall facts from. Free — no API key needed.",
        source: "builtin",
      },
      {
        name: "brave-search",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
        env: { BRAVE_API_KEY: "" },
        requires: ["BRAVE_API_KEY"],
        enabled: false,
        description: "Web search via Brave. Needs a free Brave Search API key (brave.com/search/api).",
        source: "builtin",
      },
      {
        name: "postgres",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { POSTGRES_CONNECTION_STRING: "" },
        requires: ["POSTGRES_CONNECTION_STRING"],
        enabled: false,
        description: "Query a PostgreSQL database (read-only). Needs a connection string like postgresql://user:pass@host:5432/db.",
        source: "builtin",
      },
    ];

    // Merge: user-defined configs override builtins of the same name; keep extras.
    const byName = new Map<string, McpServerConfig>();
    for (const b of builtins) byName.set(b.name, b);
    for (const u of userConfigs) {
      const existing = byName.get(u.name);
      byName.set(u.name, {
        ...existing,
        ...u,
        // preserve builtin metadata if the user config omits it
        description: u.description || existing?.description,
        requires: u.requires || existing?.requires,
        env: { ...(existing?.env || {}), ...(u.env || {}) },
        source: existing ? existing.source : "user",
      });
    }
    return Array.from(byName.values());
  }

  /**
   * Import MCP server definitions from VS Code's own config files
   * (workspace .vscode/mcp.json and the user mcp.json). Returns how many
   * new servers were imported.
   */
  async importFromVSCode(): Promise<{ imported: number; names: string[] }> {
    const fs = await import("fs");
    const candidates: string[] = [];
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws) candidates.push(path.join(ws.uri.fsPath, ".vscode", "mcp.json"));

    const names: string[] = [];
    const imported: McpServerConfig[] = [];
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        const raw = fs.readFileSync(file, "utf-8");
        // tolerate JSONC comments
        const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const parsed = JSON.parse(cleaned) as { servers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>; mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> };
        const servers = parsed.servers || parsed.mcpServers || {};
        for (const [name, def] of Object.entries(servers)) {
          if (!def.command) continue;
          imported.push({
            name,
            command: def.command,
            args: def.args || [],
            env: def.env || {},
            enabled: false,
            description: `Imported from VS Code (${path.basename(file)}).`,
            source: "vscode",
          });
          names.push(name);
        }
      } catch (e) {
        this._outputChannel.appendLine(`[MCP] Failed to import from ${file}: ${e}`);
      }
    }

    if (imported.length > 0) {
      const config = vscode.workspace.getConfiguration("sentinelCoder");
      const existing = config.get<McpServerConfig[]>("mcpServers", []);
      const existingNames = new Set(existing.map((s) => s.name));
      const merged = existing.concat(imported.filter((s) => !existingNames.has(s.name)));
      await config.update("mcpServers", merged, vscode.ConfigurationTarget.Global);
    }
    return { imported: imported.length, names };
  }

  /** Persist an env value (e.g. an API key) for a server into user settings. */
  async setServerEnv(serverName: string, key: string, value: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("sentinelCoder");
    const existing = config.get<McpServerConfig[]>("mcpServers", []);
    const defaults = this.getDefaultConfigs();
    const base = defaults.find((c) => c.name === serverName);
    const idx = existing.findIndex((c) => c.name === serverName);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], env: { ...(existing[idx].env || {}), [key]: value } };
    } else if (base) {
      existing.push({ ...base, env: { ...(base.env || {}), [key]: value } });
    }
    await config.update("mcpServers", existing, vscode.ConfigurationTarget.Global);
  }

  private _getWorkspacePath(): string {
    const ws = vscode.workspace.workspaceFolders?.[0];
    return ws ? ws.uri.fsPath : ".";
  }

  async startServer(config: McpServerConfig): Promise<void> {
    if (this._servers.has(config.name)) {
      await this.stopServer(config.name);
    }
    const conn = new McpServerConnection(config, this._outputChannel);
    await conn.start();
    this._servers.set(config.name, conn);
  }

  async stopServer(name: string): Promise<void> {
    const conn = this._servers.get(name);
    if (conn) {
      conn.stop();
      this._servers.delete(name);
    }
  }

  async stopAll(): Promise<void> {
    for (const [name] of this._servers) {
      await this.stopServer(name);
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this._servers.entries())
      .filter(([, conn]) => conn.isConnected)
      .map(([name]) => name);
  }

  /** Get all tools from all connected MCP servers, prefixed with server name */
  getAllTools(): Array<McpToolDefinition & { server: string }> {
    const allTools: Array<McpToolDefinition & { server: string }> = [];
    for (const [, conn] of this._servers) {
      if (!conn.isConnected) continue;
      for (const tool of conn.tools) {
        allTools.push({ ...tool, server: conn.name });
      }
    }
    return allTools;
  }

  /** Build a prompt section describing available MCP tools */
  getToolsForPrompt(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return "";

    let prompt = "\n\nYou also have access to MCP server tools. Use them with:\n```tool\n{\"tool\": \"mcp:<server>:<toolName>\", \"args\": {\"param\": \"value\"}}\n```\n\nMCP tools:\n";
    for (const tool of tools) {
      const params = Object.entries(tool.inputSchema.properties || {})
        .map(([k, v]) => `${k} (${v.type}${tool.inputSchema.required?.includes(k) ? ", required" : ""}): ${v.description || ""}`)
        .join("; ");
      prompt += `- **mcp:${tool.server}:${tool.name}**: ${tool.description}${params ? ` | Params: ${params}` : ""}\n`;
    }
    return prompt;
  }

  /** Execute an MCP tool call, returns the result string */
  async callTool(fullName: string, args: Record<string, unknown>): Promise<string> {
    // fullName format: mcp:<server>:<toolName>
    const parts = fullName.split(":");
    if (parts.length < 3 || parts[0] !== "mcp") {
      throw new Error(`Invalid MCP tool name: ${fullName}. Expected mcp:<server>:<toolName>`);
    }
    const serverName = parts[1];
    const toolName = parts.slice(2).join(":");

    const conn = this._servers.get(serverName);
    if (!conn || !conn.isConnected) {
      throw new Error(`MCP server '${serverName}' not connected`);
    }
    return conn.callTool(toolName, args);
  }

  /** Check if a tool name is an MCP tool */
  isMcpTool(toolName: string): boolean {
    return toolName.startsWith("mcp:");
  }

  getStatus(): Array<{ name: string; connected: boolean; toolCount: number; description?: string; requires?: string[]; envSet?: Record<string, boolean>; lastError?: string; source?: string }> {
    const configs = this.getDefaultConfigs();
    return configs.map((c) => {
      const conn = this._servers.get(c.name);
      const envSet: Record<string, boolean> = {};
      for (const k of c.requires || []) {
        envSet[k] = !!((c.env || {})[k] || "").trim();
      }
      return {
        name: c.name,
        connected: conn?.isConnected || false,
        toolCount: conn?.tools.length || 0,
        description: c.description,
        requires: c.requires || [],
        envSet,
        lastError: conn?.lastError || "",
        source: c.source || "user",
      };
    });
  }
}
