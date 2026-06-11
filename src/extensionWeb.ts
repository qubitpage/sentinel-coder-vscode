import * as vscode from "vscode";

const WEB_BRIDGE_URL_SETTING = "webRemoteBridgeUrl";
const WEB_BRIDGE_ENABLED_SETTING = "webRemoteBridgeEnabled";
const WEB_BRIDGE_TOKEN_SECRET = "sentinel-coder.webRemoteBridgeToken";

const WEB_STATUS_MESSAGE =
  "Sentinel Coder One Studio is active in the VS Code Web/browser extension host. " +
  "Provider chat, settings, documentation, and remote-workflow guidance are available here. " +
  "For real terminal, SSH, Docker, MCP process servers, local Ollama, media binaries, and unrestricted filesystem tools from vscode.dev, use either a trusted VS Code Remote/Codespaces/Dev Tunnel workspace host or a trusted HTTPS Remote Tool Bridge.";

const WEB_REMOTE_HELP =
  "How to get full tools from web: (1) preferred: open vscode.dev and connect to a Codespace, Dev Tunnel, Remote SSH target, container, WSL, or Desktop workspace so Sentinel runs on that workspace host; " +
  "or (2) configure a trusted HTTPS Sentinel Remote Tool Bridge. Then runCommand, sshCommand, dockerCommand, Git, MCP, local-model, media, and file tools execute on the trusted remote server/workspace rather than inside your browser tab.";

function webRuntimeLabel(): string {
  const uiKind = vscode.env.uiKind;
  const uiKindName = uiKind === vscode.UIKind.Web ? "web" : uiKind === vscode.UIKind.Desktop ? "desktop" : `unknown-${uiKind}`;
  return `VS Code UI kind: ${uiKindName} (${uiKind})`;
}

function webStatusMessage(): string {
  return `${WEB_STATUS_MESSAGE} ${webRuntimeLabel()}.`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] || ch));
}

function normalizeBridgeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function bridgeUrl(): string {
  return normalizeBridgeUrl(vscode.workspace.getConfiguration("sentinelCoder").get<string>(WEB_BRIDGE_URL_SETTING, "") || "");
}

async function bridgeToken(context: vscode.ExtensionContext): Promise<string> {
  return (await context.secrets.get(WEB_BRIDGE_TOKEN_SECRET)) || "";
}

async function configureRemoteBridge(context: vscode.ExtensionContext): Promise<void> {
  const current = bridgeUrl();
  const url = await vscode.window.showInputBox({
    title: "Sentinel Web Remote Tool Bridge URL",
    prompt: "Optional HTTPS endpoint for a trusted Sentinel remote execution bridge, e.g. https://agent.example.com",
    placeHolder: "https://your-sentinel-bridge.example.com",
    value: current,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = normalizeBridgeUrl(value || "");
      if (!trimmed) return undefined;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return "Use HTTPS for remote bridges. localhost is allowed for development only.";
        }
        return undefined;
      } catch {
        return "Enter a valid URL.";
      }
    }
  });
  if (url === undefined) return;

  const normalized = normalizeBridgeUrl(url);
  await vscode.workspace.getConfiguration("sentinelCoder").update(WEB_BRIDGE_URL_SETTING, normalized, vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration("sentinelCoder").update(WEB_BRIDGE_ENABLED_SETTING, !!normalized, vscode.ConfigurationTarget.Global);

  const token = await vscode.window.showInputBox({
    title: "Sentinel Web Remote Tool Bridge Token",
    prompt: "Optional bearer token. Stored in VS Code SecretStorage, never in settings/source.",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "Leave blank to keep/clear token"
  });
  if (token !== undefined) {
    if (token.trim()) await context.secrets.store(WEB_BRIDGE_TOKEN_SECRET, token.trim());
    else await context.secrets.delete(WEB_BRIDGE_TOKEN_SECRET);
  }

  await vscode.window.showInformationMessage(normalized ? "Sentinel Web Remote Tool Bridge saved." : "Sentinel Web Remote Tool Bridge disabled.");
}

async function testRemoteBridge(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<void> {
  let url = bridgeUrl();
  if (!url) {
    const choice = await vscode.window.showInformationMessage("No Sentinel Remote Tool Bridge is configured for Web mode.", "Configure bridge", "Use VS Code Remote docs");
    if (choice === "Configure bridge") await configureRemoteBridge(context);
    else if (choice === "Use VS Code Remote docs") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/docs/remote/remote-overview"));
    url = bridgeUrl();
    if (!url) return;
  }

  const token = await bridgeToken(context);
  const healthUrl = `${url}/health`;
  output.show(true);
  output.appendLine(`Testing Sentinel Remote Tool Bridge: ${healthUrl}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await response.text();
    output.appendLine(`Bridge response: HTTP ${response.status} ${response.statusText}`);
    if (text) output.appendLine(text.slice(0, 1200));
    if (response.ok) await vscode.window.showInformationMessage("Sentinel Remote Tool Bridge is reachable. Web mode can route supported remote tools through it.");
    else await vscode.window.showWarningMessage(`Bridge responded HTTP ${response.status}. Check bridge auth/CORS/health endpoint.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Bridge test failed: ${message}`);
    await vscode.window.showErrorMessage(`Sentinel Remote Tool Bridge test failed: ${message}`);
  }
}

class SentinelWebPlaceholderProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext, private readonly title: string) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const nonce = Math.random().toString(36).slice(2);
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview, nonce);
    webviewView.webview.onDidReceiveMessage(async (message: { type?: string }) => {
      if (message?.type === "docs") await vscode.env.openExternal(vscode.Uri.parse("https://github.com/qubitpage/sentinel-coder-vscode#readme"));
      else if (message?.type === "webDocs") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/api/extension-guides/web-extensions"));
      else if (message?.type === "remoteDocs") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/docs/remote/remote-overview"));
      else if (message?.type === "status") await vscode.commands.executeCommand("sentinel-coder.webStatus");
      else if (message?.type === "configureBridge") await vscode.commands.executeCommand("sentinel-coder.configureWebRemoteBridge");
      else if (message?.type === "testBridge") await vscode.commands.executeCommand("sentinel-coder.testWebRemoteBridge");
    });
  }

  private html(webview: vscode.Webview, nonce: string): string {
    const cspSource = webview.cspSource;
    const escapedTitle = escapeHtml(this.title);
    const configuredUrl = escapeHtml(bridgeUrl() || "not configured");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 16px; line-height: 1.45; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 14px; background: var(--vscode-editor-background); }
    h2 { margin: 0 0 10px; font-size: 16px; }
    h3 { margin: 14px 0 6px; font-size: 13px; }
    p { margin: 8px 0; }
    ul { margin: 6px 0 8px 18px; padding: 0; }
    li { margin: 4px 0; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .warn { color: var(--vscode-editorWarning-foreground); }
    button { margin: 10px 6px 0 0; padding: 6px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    code { color: var(--vscode-textPreformat-foreground); }
  </style>
</head>
<body>
  <div class="card">
    <h2>${escapedTitle} - Web / Remote Mode</h2>
    <p>Sentinel Coder is installed and active in the VS Code Web browser host.</p>
    <h3 class="ok">Available in pure browser host</h3>
    <ul>
      <li>Marketplace installation, settings, status, docs, and provider setup guidance.</li>
      <li>Web-safe UI views and remote-workflow instructions.</li>
      <li>Browser-safe provider API chat can run without local process access when configured.</li>
    </ul>
    <h3 class="ok">Full tools from vscode.dev via remote/workspace host</h3>
    <ul>
      <li>Preferred: open a trusted <strong>Codespace</strong>, <strong>Dev Tunnel</strong>, <strong>Remote SSH</strong>, container, WSL, or Desktop workspace.</li>
      <li>Sentinel then runs on the workspace extension host and can use files, terminal, Git, SSH, Docker, MCP, local Ollama, and media tools on that trusted machine.</li>
    </ul>
    <h3 class="ok">Optional HTTPS Remote Tool Bridge</h3>
    <ul>
      <li>Configured bridge: <code>${configuredUrl}</code></li>
      <li>The bridge can expose approved <code>runCommand</code>, <code>sshCommand</code>, <code>dockerCommand</code>, Git, MCP, local-model, build/test, and deploy operations to Web mode.</li>
    </ul>
    <h3 class="warn">Browser sandbox boundary</h3>
    <p>A browser tab itself cannot spawn local <code>ssh</code>, <code>docker</code>, shells, local model servers, or MCP binaries. Sentinel does not hide those workflows; it routes them through a trusted desktop/remote host or configured Remote Tool Bridge.</p>
    <button id="status">Show Web/Remote Status</button>
    <button id="configureBridge">Configure Bridge</button>
    <button id="testBridge">Test Bridge</button>
    <button id="docs">Sentinel Docs</button>
    <button id="remoteDocs">VS Code Remote Docs</button>
    <button id="webDocs">Web Extension API</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('status').addEventListener('click', () => vscode.postMessage({ type: 'status' }));
    document.getElementById('configureBridge').addEventListener('click', () => vscode.postMessage({ type: 'configureBridge' }));
    document.getElementById('testBridge').addEventListener('click', () => vscode.postMessage({ type: 'testBridge' }));
    document.getElementById('docs').addEventListener('click', () => vscode.postMessage({ type: 'docs' }));
    document.getElementById('remoteDocs').addEventListener('click', () => vscode.postMessage({ type: 'remoteDocs' }));
    document.getElementById('webDocs').addEventListener('click', () => vscode.postMessage({ type: 'webDocs' }));
  </script>
</body>
</html>`;
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Sentinel Coder One Studio (Web)");
  output.appendLine("Sentinel Coder activated in the VS Code Web/browser extension host.");
  output.appendLine(webRuntimeLabel());
  output.appendLine(webStatusMessage());
  output.appendLine(WEB_REMOTE_HELP);

  const showWebStatus = vscode.commands.registerCommand("sentinel-coder.webStatus", async () => {
    const statusMessage = webStatusMessage();
    output.show(true);
    output.appendLine(webRuntimeLabel());
    output.appendLine(`Remote Tool Bridge: ${bridgeUrl() || "not configured"}`);
    const choice = await vscode.window.showInformationMessage(statusMessage, "Remote setup", "Configure bridge", "Test bridge", "Sentinel docs");
    if (choice === "Remote setup") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/docs/remote/remote-overview"));
    else if (choice === "Configure bridge") await configureRemoteBridge(context);
    else if (choice === "Test bridge") await testRemoteBridge(context, output);
    else if (choice === "Sentinel docs") await vscode.env.openExternal(vscode.Uri.parse("https://github.com/qubitpage/sentinel-coder-vscode#readme"));
  });

  const openDesktopHelp = vscode.commands.registerCommand("sentinel-coder.openDesktopHelp", async () => {
    const choice = await vscode.window.showInformationMessage(WEB_REMOTE_HELP, "Remote overview", "Configure bridge", "Download Desktop", "Sentinel docs");
    if (choice === "Remote overview") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/docs/remote/remote-overview"));
    else if (choice === "Configure bridge") await configureRemoteBridge(context);
    else if (choice === "Download Desktop") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/download"));
    else if (choice === "Sentinel docs") await vscode.env.openExternal(vscode.Uri.parse("https://github.com/qubitpage/sentinel-coder-vscode#readme"));
  });

  const configureBridgeCommand = vscode.commands.registerCommand("sentinel-coder.configureWebRemoteBridge", async () => configureRemoteBridge(context));
  const testBridgeCommand = vscode.commands.registerCommand("sentinel-coder.testWebRemoteBridge", async () => testRemoteBridge(context, output));

  const webGuidanceCommand = (label: string) => vscode.commands.registerCommand(label, async () => {
    const configured = bridgeUrl();
    if (configured) await testRemoteBridge(context, output);
    else await vscode.commands.executeCommand("sentinel-coder.webStatus");
  });

  const chatProvider = new SentinelWebPlaceholderProvider(context, "Sentinel Coder Chat");
  const studioProvider = new SentinelWebPlaceholderProvider(context, "Sentinel Coder Studio");
  const chatView = vscode.window.registerWebviewViewProvider("sentinel-coder.chatView", chatProvider, { webviewOptions: { retainContextWhenHidden: true } });
  const studioView = vscode.window.registerWebviewViewProvider("sentinel-coder.studioView", studioProvider, { webviewOptions: { retainContextWhenHidden: true } });

  context.subscriptions.push(
    output,
    showWebStatus,
    openDesktopHelp,
    configureBridgeCommand,
    testBridgeCommand,
    webGuidanceCommand("sentinel-coder.setEndpoint"),
    webGuidanceCommand("sentinel-coder.clearChat"),
    webGuidanceCommand("sentinel-coder.refreshStudio"),
    webGuidanceCommand("sentinel-coder.openStudio"),
    webGuidanceCommand("sentinel-coder.atlasVoiceBridgeStatus"),
    webGuidanceCommand("sentinel-coder.sendAtlasVoiceToCopilot"),
    chatView,
    studioView
  );

  void vscode.window.showInformationMessage(
    "Sentinel Coder loaded in Web/Remote mode. Use VS Code Remote/Codespaces/Dev Tunnels or configure a Remote Tool Bridge for terminal, SSH, Docker, MCP, local model, and media tools.",
    "Remote setup",
    "Configure bridge",
    "Details"
  ).then(async (choice) => {
    if (choice === "Remote setup") await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/docs/remote/remote-overview"));
    else if (choice === "Configure bridge") await configureRemoteBridge(context);
    else if (choice === "Details") await vscode.commands.executeCommand("sentinel-coder.webStatus");
  });
}

export function deactivate() {
  // No Node resources are opened directly in the pure browser extension host.
}
