import * as vscode from "vscode";

const WEB_LIMITATION_MESSAGE =
  "Sentinel Coder One Studio is running in VS Code for the Web. " +
  "The web host cannot access local Node.js APIs, terminals, SSH, Docker, Ollama, local model servers, or unrestricted desktop filesystem paths. " +
  "Use VS Code Desktop for full autonomous agent tools. Web mode keeps the extension installable/activatable and exposes safe status/settings guidance.";

class SentinelWebPlaceholderProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext, private readonly title: string) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const nonce = Math.random().toString(36).slice(2);
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview, nonce);
    webviewView.webview.onDidReceiveMessage(async (message: { type?: string }) => {
      if (message?.type === "docs") {
        await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/api/extension-guides/web-extensions"));
      } else if (message?.type === "status") {
        await vscode.commands.executeCommand("sentinel-coder.webStatus");
      }
    });
  }

  private html(webview: vscode.Webview, nonce: string): string {
    const cspSource = webview.cspSource;
    const docs = "https://code.visualstudio.com/api/extension-guides/web-extensions";
    const escapedTitle = this.title.replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] || ch));
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
    p { margin: 8px 0; }
    button { margin-top: 10px; padding: 6px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    code { color: var(--vscode-textPreformat-foreground); }
  </style>
</head>
<body>
  <div class="card">
    <h2>${escapedTitle} — Web Mode</h2>
    <p>Sentinel Coder is installed and active in the VS Code Web extension host.</p>
    <p><strong>Limited by browser sandbox:</strong> terminals, SSH, Docker, local Ollama, Node.js subprocesses, unrestricted filesystem access, and desktop-only autonomous tools require VS Code Desktop.</p>
    <p>Settings and marketplace compatibility are available here; use Desktop for full Agentic Profiles, Dynamic Context, file editing, builds, packaging, and local tool execution.</p>
    <button id="status">Show Web Status</button>
    <button id="docs">Open Web Extension Docs</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('status').addEventListener('click', () => vscode.postMessage({ type: 'status' }));
    document.getElementById('docs').addEventListener('click', () => vscode.postMessage({ type: 'docs' }));
  </script>
</body>
</html>`;
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Sentinel Coder One Studio (Web)");
  output.appendLine("Sentinel Coder activated in the VS Code Web extension host.");
  output.appendLine(WEB_LIMITATION_MESSAGE);

  const showWebStatus = vscode.commands.registerCommand("sentinel-coder.webStatus", async () => {
    output.show(true);
    const choice = await vscode.window.showInformationMessage(WEB_LIMITATION_MESSAGE, "Open docs", "Use Desktop");
    if (choice === "Open docs") {
      await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/api/extension-guides/web-extensions"));
    } else if (choice === "Use Desktop") {
      await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/download"));
    }
  });

  const openDesktopHelp = vscode.commands.registerCommand("sentinel-coder.openDesktopHelp", async () => {
    const choice = await vscode.window.showInformationMessage(
      "For full Sentinel agent mode, install/use VS Code Desktop. The browser sandbox blocks local terminal, process, SSH, Docker, local models, and unrestricted filesystem operations.",
      "Download VS Code",
      "Learn about web extensions"
    );
    if (choice === "Download VS Code") {
      await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/download"));
    } else if (choice === "Learn about web extensions") {
      await vscode.env.openExternal(vscode.Uri.parse("https://code.visualstudio.com/api/extension-guides/web-extensions"));
    }
  });

  const unsupportedCommand = (label: string) => vscode.commands.registerCommand(label, async () => {
    await vscode.commands.executeCommand("sentinel-coder.webStatus");
  });

  const chatProvider = new SentinelWebPlaceholderProvider(context, "Sentinel Coder Chat");
  const studioProvider = new SentinelWebPlaceholderProvider(context, "Sentinel Coder Studio");
  const chatView = vscode.window.registerWebviewViewProvider("sentinel-coder.chatView", chatProvider, { webviewOptions: { retainContextWhenHidden: true } });
  const studioView = vscode.window.registerWebviewViewProvider("sentinel-coder.studioView", studioProvider, { webviewOptions: { retainContextWhenHidden: true } });

  context.subscriptions.push(
    output,
    showWebStatus,
    openDesktopHelp,
    unsupportedCommand("sentinel-coder.setEndpoint"),
    unsupportedCommand("sentinel-coder.clearChat"),
    unsupportedCommand("sentinel-coder.refreshStudio"),
    unsupportedCommand("sentinel-coder.openStudio"),
    unsupportedCommand("sentinel-coder.atlasVoiceBridgeStatus"),
    unsupportedCommand("sentinel-coder.sendAtlasVoiceToCopilot"),
    chatView,
    studioView
  );

  void vscode.window.showInformationMessage(
    "Sentinel Coder loaded in Web compatibility mode. Desktop VS Code is required for full agent tools.",
    "Details"
  ).then(async (choice) => {
    if (choice === "Details") {
      await vscode.commands.executeCommand("sentinel-coder.webStatus");
    }
  });
}

export function deactivate() {
  // No Node resources are opened in the web extension host.
}
