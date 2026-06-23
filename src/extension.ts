import * as vscode from "vscode";
import * as http from "http";
import { OllamaClient, OllamaMessage } from "./ollama";
import { MultiProviderClient } from "./providers";
import { SentinelLanguageModelProvider } from "./lmProvider";
import { SentinelSidebarProvider } from "./sidebarProvider";
import { SentinelStudioProvider } from "./studioProvider";
import { ToolRegistry } from "./toolRegistry";
import {
  createFile,
  readFile,
  listDirectory,
  runCommand,
  serveFile,
  extractCodeBlocks,
  suggestFilename,
} from "./tools";

const SYSTEM_PROMPT = `You are Sentinel Coder One, a fine-tuned Qwen2.5-Coder-14B model by QubitPage Research — Gen 5, trained on 462,000 coding examples.
You are an expert AI coding agent with deep expertise in: TypeScript, Next.js 14+, React, Node.js, Python 3.12+, Flask, FastAPI, Laravel 11, PHP 8.3, MySQL, PostgreSQL, MedusaJS v2, Docker, Nginx, SSH, Linux (Ubuntu/Debian), Git, CI/CD, IBM Qiskit, QASM, ROS2/Isaac Sim robotics, and full-stack web development.

You operate as an autonomous agent with access to:
- Filesystem tools (read, write, edit, delete, list, search files)
- Terminal execution (run commands, scripts, Docker, SSH)
- Editor integration (open files, insert text, get diagnostics)
- Git operations (status, diff, commit, push, log)
- Web/network (HTTP requests, serve files, open browser)
- RAG knowledge base (query and ingest documentation)
- MCP servers (filesystem, database, browser automation)

Your operating principles:
1. **Think** step-by-step about the approach
2. **Act** using tools — NEVER tell the user to do something manually
3. **Observe** results and verify they are correct
4. **Iterate** until the task is fully complete
5. **Secure** — never expose credentials, validate inputs, follow OWASP best practices

You write production-quality, well-structured, secure code.
You use proper error handling, typing, and follow framework conventions.
You verify by executing — never guess.`;

let client: OllamaClient;
let outputChannel: vscode.OutputChannel;
let sidebarProvider: SentinelSidebarProvider;
let studioProvider: SentinelStudioProvider;
let toolRegistry: ToolRegistry;
let atlasVoiceBridge: http.Server | undefined;
let lastAtlasVoiceCommand = "";

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel first for diagnostics
  outputChannel = vscode.window.createOutputChannel("Sentinel Coder One Studio");
  outputChannel.appendLine("Sentinel Coder: activating...");

  try {
    const config = vscode.workspace.getConfiguration("sentinelCoder");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://127.0.0.1:11434");
    const model = config.get<string>("model", "sentinel-coder:latest");

    client = new OllamaClient(ollamaUrl, model);
    outputChannel.appendLine(`Ollama: ${ollamaUrl}, model: ${model}`);
    toolRegistry = new ToolRegistry(context.secrets);

    // Create multi-provider client and load API keys
    const multiClient = new MultiProviderClient();
    multiClient.loadFromConfig(config);
    // Try loading API keys from file
    // Load keys from SecretStorage (encrypted)
    try {
      await multiClient.loadKeysFromSecrets(context.secrets);
      outputChannel.appendLine("API keys loaded from SecretStorage");
    } catch {
      outputChannel.appendLine("No saved API keys found (enter via Settings > Providers)");
    }
    // Optionally load from a text file (power-user feature).
    // Stable provider runtime returns void here, so do not assume an imported-provider list.
    const apiKeysPath = config.get<string>("apiKeysFile", "");
    if (apiKeysPath) {
      try {
        multiClient.loadApiKeysFromFile(apiKeysPath);
        await multiClient.saveKeysToSecrets();
        multiClient.saveToConfig(config);
        outputChannel.appendLine(`API keys file processed: ${apiKeysPath}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine("API keys file could not be processed: " + apiKeysPath + " (" + errMsg + ")");
      }
    }

    // Register the native chat model provider so Sentinel/Azure/Kimi models
    // appear in VS Code's built-in Copilot Chat model picker.
    try {
      const lmProvider = new SentinelLanguageModelProvider(multiClient, outputChannel);
      context.subscriptions.push(
        vscode.lm.registerLanguageModelChatProvider("sentinel-coder", lmProvider)
      );
      // Re-advertise models after async key loads settle.
      setTimeout(() => lmProvider.refresh(), 1500);
      outputChannel.appendLine("Language model chat provider registered (vendor: sentinel-coder)");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Language model provider registration failed — ${errMsg}`);
    }

    // Register the chat participant
    try {
      const participant = vscode.chat.createChatParticipant(
        "sentinel-coder.chat",
        chatHandler
      );
      participant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "icon.svg"
      );
      context.subscriptions.push(participant);
      outputChannel.appendLine("Chat participant registered: @sentinel");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`FAILED to register chat participant: ${errMsg}`);
      vscode.window.showErrorMessage(
        `Sentinel Coder: Chat participant registration failed — ${errMsg}`
      );
    }

    // Register sidebar webview provider
    try {
      sidebarProvider = new SentinelSidebarProvider(
        context.extensionUri,
        client,
        outputChannel,
        toolRegistry,
        multiClient,
        context
      );
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          SentinelSidebarProvider.viewType,
          sidebarProvider,
          { webviewOptions: { retainContextWhenHidden: true } }
        )
      );
      outputChannel.appendLine("Sidebar chat panel registered");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`FAILED to register sidebar: ${errMsg}`);
    }

    // Register native Media & Document Studio webview provider
    try {
      studioProvider = new SentinelStudioProvider(
        context.extensionUri,
        outputChannel,
        (message: string) => sidebarProvider?.queueExternalUserRequest(message, true)
      );
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          SentinelStudioProvider.viewType,
          studioProvider,
          { webviewOptions: { retainContextWhenHidden: true } }
        )
      );
      outputChannel.appendLine("Media & Document Studio panel registered");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`FAILED to register Studio: ${errMsg}`);
    }

    // Listen for config changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("sentinelCoder")) {
          const cfg = vscode.workspace.getConfiguration("sentinelCoder");
          client.setBaseUrl(
            cfg.get<string>("ollamaUrl", "http://127.0.0.1:11434")
          );
          client.setModel(
            cfg.get<string>("model", "sentinel-coder:latest")
          );
          outputChannel.appendLine("Config updated");
        }
      })
    );

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "sentinel-coder.setEndpoint",
        async () => {
          const url = await vscode.window.showInputBox({
            prompt: "Enter Ollama API URL",
            value: ollamaUrl,
            placeHolder: "http://127.0.0.1:11434",
          });
          if (url) {
            await vscode.workspace
              .getConfiguration("sentinelCoder")
              .update("ollamaUrl", url, vscode.ConfigurationTarget.Global);
            client.setBaseUrl(url);
            vscode.window.showInformationMessage(
              `Sentinel Coder: endpoint set to ${url}`
            );
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sentinel-coder.clearChat", () => {
        if (sidebarProvider) {
          sidebarProvider.clearHistory();
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sentinel-coder.refreshStudio", async () => {
        await studioProvider?.refresh();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sentinel-coder.openStudio", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.sentinel-coder-sidebar");
        await vscode.commands.executeCommand("sentinel-coder.studioView.focus");
        await studioProvider?.refresh();
      })
    );

    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBar.text = "$(hubot) Sentinel";
    statusBar.tooltip = "Sentinel Coder — Click to check status";
    statusBar.command = "sentinel-coder.setEndpoint";
    statusBar.show();
    context.subscriptions.push(statusBar);

    // Check connectivity on activation
    client.isAvailable().then((ok) => {
      if (ok) {
        statusBar.text = "$(hubot) Sentinel ✓";
        statusBar.tooltip = `Connected to ${ollamaUrl} (${model})`;
        outputChannel.appendLine("Ollama connection: OK");
      } else {
        statusBar.text = "$(hubot) Sentinel ✗";
        statusBar.tooltip = `Cannot reach ${ollamaUrl}`;
        outputChannel.appendLine("Ollama connection: FAILED");
        vscode.window.showWarningMessage(
          `Sentinel Coder: Cannot reach Ollama at ${ollamaUrl}. Make sure Ollama is running.`
        );
      }
    });

    // Register internal commands for file creation, editing, etc.
    registerInternalCommands(context);
    startAtlasVoiceBridge(context, statusBar);

    outputChannel.appendLine("Sentinel Coder: activation complete");
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (outputChannel) {
      outputChannel.appendLine(`FATAL activation error: ${errMsg}`);
    }
    vscode.window.showErrorMessage(
      `Sentinel Coder failed to activate: ${errMsg}`
    );
  }
}

async function chatHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const config = vscode.workspace.getConfiguration("sentinelCoder");
  const temperature = config.get<number>("temperature", 0.3);
  const maxTokens = config.get<number>("maxTokens", 4096);

  // Handle slash commands
  if (request.command === "create") {
    return handleCreateCommand(request, stream, token, temperature, maxTokens);
  }
  if (request.command === "run") {
    return handleRunCommand(request, stream);
  }
  if (request.command === "edit") {
    return handleEditCommand(request, stream, token, temperature, maxTokens);
  }

  // Regular chat — build messages from context history
  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation history from VS Code chat context
  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push({ role: "user", content: turn.prompt });
    } else if (turn instanceof vscode.ChatResponseTurn) {
      // Reconstruct assistant text from response parts
      let assistantText = "";
      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          assistantText += part.value.value;
        }
      }
      if (assistantText) {
        messages.push({ role: "assistant", content: assistantText });
      }
    }
  }

  messages.push({ role: "user", content: request.prompt });

  // Check if Ollama is reachable
  const available = await client.isAvailable();
  if (!available) {
    stream.markdown(
      "⚠️ **Cannot reach Ollama.** Make sure it's running:\n```\nollama serve\n```"
    );
    return { metadata: { command: "" } };
  }

  // Stream the response
  let fullResponse = "";
  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  try {
    for await (const chunk of client.streamChat(
      messages,
      { temperature, num_predict: maxTokens },
      abortController.signal
    )) {
      if (token.isCancellationRequested) break;
      fullResponse += chunk;
      stream.markdown(chunk);
    }
  } catch (err: unknown) {
    if (!token.isCancellationRequested) {
      const errMsg = err instanceof Error ? err.message : String(err);
      stream.markdown(`\n\n⚠️ **Error:** ${errMsg}`);
    }
    return { metadata: { command: "" } };
  }

  // Check if response contains code blocks — offer to create files
  const codeBlocks = extractCodeBlocks(fullResponse);
  if (codeBlocks.length > 0) {
    for (const block of codeBlocks) {
      const filename =
        block.filename || suggestFilename(block.language, block.code);

      // Use a follow-up button to create the file
      stream.button({
        command: "sentinel-coder.internal.createFile",
        title: `📄 Create ${filename}`,
        arguments: [filename, block.code],
      });
    }

    // Also offer to serve HTML files
    const htmlBlock = codeBlocks.find(
      (b) => b.language === "html" || b.language === "htm"
    );
    if (htmlBlock) {
      const htmlFilename =
        htmlBlock.filename ||
        suggestFilename(htmlBlock.language, htmlBlock.code);
      stream.button({
        command: "sentinel-coder.internal.createAndServe",
        title: `🌐 Create & Open in Browser`,
        arguments: [htmlFilename, htmlBlock.code],
      });
    }
  }

  return { metadata: { command: "" } };
}

async function handleCreateCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  temperature: number,
  maxTokens: number
): Promise<vscode.ChatResult> {
  const prompt = request.prompt;

  stream.progress("Generating code...");

  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Create the following. Output ONLY the complete code in a fenced code block with the language tag. Include a filename comment on the first line.\n\n${prompt}`,
    },
  ];

  let fullResponse = "";
  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  try {
    for await (const chunk of client.streamChat(
      messages,
      { temperature, num_predict: maxTokens },
      abortController.signal
    )) {
      if (token.isCancellationRequested) break;
      fullResponse += chunk;
      stream.markdown(chunk);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stream.markdown(`\n\n⚠️ **Error:** ${errMsg}`);
    return { metadata: { command: "create" } };
  }

  // Extract and offer to create files
  const codeBlocks = extractCodeBlocks(fullResponse);
  for (const block of codeBlocks) {
    const filename =
      block.filename || suggestFilename(block.language, block.code);

    stream.button({
      command: "sentinel-coder.internal.createFile",
      title: `📄 Create ${filename}`,
      arguments: [filename, block.code],
    });

    if (
      block.language === "html" ||
      block.language === "htm"
    ) {
      stream.button({
        command: "sentinel-coder.internal.createAndServe",
        title: `🌐 Create & Open in Browser`,
        arguments: [filename, block.code],
      });
    }
  }

  return { metadata: { command: "create" } };
}

async function handleRunCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  const command = request.prompt.trim();
  if (!command) {
    stream.markdown("Please specify a command to run. Example: `@sentinel /run npm start`");
    return { metadata: { command: "run" } };
  }

  stream.progress(`Running: ${command}`);

  try {
    const result = await runCommand(command);
    stream.markdown(`**Command:** \`${command}\`\n\n`);

    if (result.stdout) {
      stream.markdown(`**Output:**\n\`\`\`\n${result.stdout.slice(0, 5000)}\n\`\`\`\n`);
    }
    if (result.stderr) {
      stream.markdown(`**Stderr:**\n\`\`\`\n${result.stderr.slice(0, 2000)}\n\`\`\`\n`);
    }
    stream.markdown(`**Exit code:** ${result.exitCode}`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stream.markdown(`⚠️ **Error running command:** ${errMsg}`);
  }

  return { metadata: { command: "run" } };
}

async function handleEditCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  temperature: number,
  maxTokens: number
): Promise<vscode.ChatResult> {
  // Get the active editor content for context
  const editor = vscode.window.activeTextEditor;
  let fileContext = "";
  if (editor) {
    const doc = editor.document;
    fileContext = `\nCurrent file: ${doc.fileName}\nContent:\n\`\`\`${doc.languageId}\n${doc.getText().slice(0, 6000)}\n\`\`\`\n`;
  }

  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Edit the following file as requested. Output the COMPLETE updated file content in a fenced code block.${fileContext}\n\nEdit request: ${request.prompt}`,
    },
  ];

  stream.progress("Generating edit...");

  let fullResponse = "";
  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  try {
    for await (const chunk of client.streamChat(
      messages,
      { temperature, num_predict: maxTokens },
      abortController.signal
    )) {
      if (token.isCancellationRequested) break;
      fullResponse += chunk;
      stream.markdown(chunk);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stream.markdown(`\n\n⚠️ **Error:** ${errMsg}`);
  }

  // Extract code blocks and offer to apply
  const codeBlocks = extractCodeBlocks(fullResponse);
  if (codeBlocks.length > 0 && editor) {
    stream.button({
      command: "sentinel-coder.internal.applyEdit",
      title: "✏️ Apply Edit to Current File",
      arguments: [editor.document.uri.fsPath, codeBlocks[0].code],
    });
  }

  return { metadata: { command: "edit" } };
}

export function deactivate() {
  if (atlasVoiceBridge) {
    atlasVoiceBridge.close();
    atlasVoiceBridge = undefined;
  }
  // Cleanly stop all MCP server connections
  if (sidebarProvider) {
    sidebarProvider.getMcpManager().stopAll();
  }
}

type AtlasVoicePayload = {
  command?: string;
  source?: string;
  region?: { id?: string; city?: string };
  mode?: string;
};

function writeBridgeResponse(
  response: http.ServerResponse,
  status: number,
  payload: Record<string, unknown>,
  origin?: string
) {
  const headers: http.OutgoingHttpHeaders = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  response.writeHead(status, {
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function isAllowedAtlasOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  const config = vscode.workspace.getConfiguration("sentinelCoder");
  const allowed = config.get<string[]>("atlasVoiceAllowedOrigins", [
    "https://atlas.qubitpage.com",
    "http://localhost",
    "http://127.0.0.1",
  ]);
  return allowed.some((item) => origin === item || origin.startsWith(`${item}:`))
    ? origin
    : undefined;
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) {
        request.destroy(new Error("Atlas voice payload too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function openCopilotChatWithPrompt(prompt: string): Promise<string> {
  await vscode.env.clipboard.writeText(prompt);
  const args = { query: prompt, isPartialQuery: false };
  const commands = [
    "workbench.action.chat.open",
    "workbench.panel.chat.view.copilot.focus",
    "workbench.panel.chat.view.edits.focus",
  ];
  for (const command of commands) {
    try {
      await vscode.commands.executeCommand(command, args);
      return command;
    } catch (error) {
      outputChannel.appendLine(`Atlas bridge chat command failed: ${command}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await vscode.commands.executeCommand("workbench.action.chat.open");
  return "clipboard-only";
}

async function runCopilotLanguageModel(prompt: string): Promise<string | undefined> {
  const lmApi = (vscode as unknown as { lm?: { selectChatModels?: Function } }).lm;
  if (!lmApi?.selectChatModels) return undefined;
  const [model] = await lmApi.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
  if (!model?.sendRequest) return undefined;
  const response = await model.sendRequest([
    vscode.LanguageModelChatMessage.User(prompt),
  ], {}, new vscode.CancellationTokenSource().token);
  let text = "";
  for await (const fragment of response.text) text += fragment;
  return text.trim();
}

async function handleAtlasVoicePayload(payload: AtlasVoicePayload) {
  const command = String(payload.command || "").trim();
  if (!command) throw new Error("Missing Atlas voice command");

  const prefix = payload.region?.city || payload.region?.id || payload.mode
    ? `Atlas context: region=${payload.region?.city || payload.region?.id || "none"}, mode=${payload.mode || "unknown"}.\n\n`
    : "";
  const prompt = `${prefix}${command}`;
  lastAtlasVoiceCommand = prompt;
  outputChannel.appendLine(`Atlas voice command received: ${prompt.replace(/\s+/g, " ").slice(0, 500)}`);

  const config = vscode.workspace.getConfiguration("sentinelCoder");
  let openedBy = "disabled";
  let modelPreview: string | undefined;
  if (config.get<boolean>("atlasVoiceAutoOpenChat", true)) {
    openedBy = await openCopilotChatWithPrompt(prompt);
  } else {
    await vscode.env.clipboard.writeText(prompt);
  }

  if (config.get<boolean>("atlasVoiceAutoRunCopilotModel", false)) {
    try {
      modelPreview = await runCopilotLanguageModel(prompt);
      if (modelPreview) {
        const doc = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: `# Atlas Voice Copilot Response\n\n## Prompt\n\n${prompt}\n\n## Response\n\n${modelPreview}`,
        });
        await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
      }
    } catch (error) {
      outputChannel.appendLine(`Atlas bridge Copilot LM failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  vscode.window.showInformationMessage("Atlas voice command sent to Copilot handoff.");
  return { openedBy, copied: true, modelPreview: Boolean(modelPreview) };
}

function startAtlasVoiceBridge(
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
) {
  const config = vscode.workspace.getConfiguration("sentinelCoder");
  const port = config.get<number>("atlasVoiceBridgePort", 37777);

  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel-coder.atlasVoiceBridgeStatus", () => {
      vscode.window.showInformationMessage(
        atlasVoiceBridge
          ? `Atlas Voice Bridge listening on http://127.0.0.1:${port}`
          : "Atlas Voice Bridge is not running"
      );
    }),
    vscode.commands.registerCommand("sentinel-coder.sendAtlasVoiceToCopilot", async () => {
      const prompt = lastAtlasVoiceCommand || await vscode.window.showInputBox({
        prompt: "Atlas voice command to send to Copilot Chat",
        placeHolder: "Create a health check script for the selected Vultr instance",
      });
      if (prompt) await handleAtlasVoicePayload({ command: prompt, source: "manual-command" });
    })
  );

  atlasVoiceBridge = http.createServer(async (request, response) => {
    const allowedOrigin = isAllowedAtlasOrigin(request.headers.origin);
    try {
      if (request.method === "OPTIONS") {
        writeBridgeResponse(response, allowedOrigin ? 204 : 403, allowedOrigin ? {} : { error: "origin not allowed" }, allowedOrigin);
        return;
      }
      if (request.method === "GET" && request.url?.startsWith("/health")) {
        writeBridgeResponse(response, 200, { ok: true, service: "atlas-voice-bridge", port }, allowedOrigin);
        return;
      }
      if (request.method !== "POST" || !request.url?.startsWith("/atlas-voice")) {
        writeBridgeResponse(response, 404, { error: "not found" }, allowedOrigin);
        return;
      }
      if (request.headers.origin && !allowedOrigin) {
        writeBridgeResponse(response, 403, { error: "origin not allowed" });
        return;
      }
      const raw = await readRequestBody(request);
      const payload = JSON.parse(raw || "{}");
      const result = await handleAtlasVoicePayload(payload);
      writeBridgeResponse(response, 200, { ok: true, ...result }, allowedOrigin);
    } catch (error) {
      writeBridgeResponse(response, 400, { error: error instanceof Error ? error.message : String(error) }, allowedOrigin);
    }
  });

  // Bind with graceful fallback. When another VS Code window already owns the
  // bridge port (EADDRINUSE), we silently try the next few ports instead of
  // spamming a warning popup on every reload. If none are free we just disable
  // the bridge for this window (another window is already serving it).
  const MAX_PORT_TRIES = 5;
  let portAttempt = 0;

  const onListening = () => {
    const activePort = (atlasVoiceBridge?.address() as { port?: number } | null)?.port ?? port;
    outputChannel.appendLine(`Atlas Voice Bridge listening on http://127.0.0.1:${activePort}/atlas-voice`);
    statusBar.tooltip = `${statusBar.tooltip || "Sentinel Coder"}\nAtlas Voice Bridge: 127.0.0.1:${activePort}`;
  };

  const onError = (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      portAttempt++;
      if (portAttempt <= MAX_PORT_TRIES) {
        const nextPort = port + portAttempt;
        outputChannel.appendLine(`Atlas Voice Bridge: port ${port + portAttempt - 1} busy, trying ${nextPort}…`);
        setTimeout(() => {
          try { atlasVoiceBridge?.listen(nextPort, "127.0.0.1"); } catch { /* ignore */ }
        }, 150);
        return;
      }
      // Another window already owns the bridge — disable quietly, no popup.
      outputChannel.appendLine(
        `Atlas Voice Bridge: ports ${port}-${port + MAX_PORT_TRIES} all in use (another VS Code window is likely hosting it). Bridge disabled in this window.`
      );
      try { atlasVoiceBridge?.close(); } catch { /* ignore */ }
      atlasVoiceBridge = undefined;
      return;
    }
    // Genuine, unexpected error: log it (still no modal spam).
    outputChannel.appendLine(`Atlas Voice Bridge error: ${error.message}`);
  };

  atlasVoiceBridge.on("listening", onListening);
  atlasVoiceBridge.on("error", onError);
  atlasVoiceBridge.listen(port, "127.0.0.1");
}

// Register internal commands during activation
export function registerInternalCommands(
  context: vscode.ExtensionContext
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentinel-coder.internal.createFile",
      async (filename: string, content: string) => {
        try {
          const createdPath = await createFile(filename, content);
          vscode.window.showInformationMessage(
            `Created: ${createdPath}`
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Failed to create file: ${errMsg}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      "sentinel-coder.internal.createAndServe",
      async (filename: string, content: string) => {
        try {
          const createdPath = await createFile(filename, content);
          vscode.window.showInformationMessage(
            `Created: ${createdPath}`
          );

          const url = await serveFile(createdPath);
          vscode.window.showInformationMessage(
            `Serving at: ${url}`
          );
          vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Failed: ${errMsg}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      "sentinel-coder.internal.applyEdit",
      async (filePath: string, newContent: string) => {
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, newContent);
          });
          vscode.window.showInformationMessage(
            `Applied edit to ${filePath}`
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Failed to apply edit: ${errMsg}`
          );
        }
      }
    )
  );
}
