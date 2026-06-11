import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as child_process from "child_process";

/**
 * Resolve the base directory for relative paths. When a workspace folder is
 * open it is used; otherwise we fall back to a per-user scratch directory so
 * the agent can still create/serve files instead of failing silently.
 */
export function getWorkspaceRoot(): { root: string; isFallback: boolean } {
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (wsFolder) {
    return { root: wsFolder.uri.fsPath, isFallback: false };
  }
  const fallback = path.join(os.tmpdir(), "sentinel-coder");
  try {
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
  } catch {
    // ignore — directory creation is best effort
  }
  return { root: fallback, isFallback: true };
}

/**
 * Whether a workspace folder is currently open in VS Code.
 */
export function hasOpenWorkspace(): boolean {
  return !!vscode.workspace.workspaceFolders?.length;
}

/**
 * Create a file in the workspace with content.
 */
export async function createFile(
  filePath: string,
  content: string
): Promise<string> {
  // Resolve relative paths against workspace root (or a scratch dir if none).
  let resolvedPath = filePath;
  if (!path.isAbsolute(filePath)) {
    resolvedPath = path.join(getWorkspaceRoot().root, filePath);
  }

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, content, "utf-8");

  // Open the file in the editor
  const doc = await vscode.workspace.openTextDocument(resolvedPath);
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });

  return resolvedPath;
}

/**
 * Read a file from the workspace.
 */
export async function readFile(filePath: string): Promise<string> {
  let resolvedPath = filePath;
  if (!path.isAbsolute(filePath)) {
    resolvedPath = path.join(getWorkspaceRoot().root, filePath);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, "utf-8");
}

/**
 * List files and directories.
 */
export function listDirectory(dirPath: string): string[] {
  let resolvedPath = dirPath;
  if (!path.isAbsolute(dirPath)) {
    resolvedPath = path.join(getWorkspaceRoot().root, dirPath);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Directory not found: ${resolvedPath}`);
  }

  return fs.readdirSync(resolvedPath).map((entry) => {
    const fullPath = path.join(resolvedPath, entry);
    const stat = fs.statSync(fullPath);
    return stat.isDirectory() ? `${entry}/` : entry;
  });
}

/**
 * Run a terminal command and return the output.
 *
 * This legacy helper uses a one-shot child process rather than the agent's
 * persistent shell. Keep it bounded and explicit so older chat paths cannot
 * hang silently or leave confusing empty output.
 */
export function runCommand(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const workDir = cwd || getWorkspaceRoot().root || process.cwd();
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  const timeoutMs = 120000;

  return new Promise((resolve) => {
    child_process.exec(
      command,
      {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        shell,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        let exitCode = 0;
        if (error) {
          const maybeCode = (error as NodeJS.ErrnoException & { code?: string | number }).code;
          exitCode = typeof maybeCode === "number" ? maybeCode : 1;
          const killed = (error as NodeJS.ErrnoException & { killed?: boolean }).killed;
          if (killed || maybeCode === "ETIMEDOUT") {
            stderr = `${stderr}\n[Tool timed out after ${Math.round(timeoutMs / 1000)}s; child process was killed.]`;
          }
        }

        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode,
        });
      }
    );
  });
}

/**
 * Start an HTTP server for a file and return the URL.
 */
export async function serveFile(filePath: string): Promise<string> {
  let resolvedPath = filePath;
  if (!path.isAbsolute(filePath)) {
    resolvedPath = path.join(getWorkspaceRoot().root, filePath);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const dir = path.dirname(resolvedPath);

  // Find a free port and start a simple HTTP server
  const http = await import("http");
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
  };

  const server = http.createServer((req, res) => {
    const reqPath = req.url === "/" ? `/${path.basename(resolvedPath)}` : req.url || "/";
    // Sanitize path to prevent directory traversal
    const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(dir, safePath);

    // Ensure the resolved path is within the served directory
    if (!fullPath.startsWith(dir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const content = fs.readFileSync(fullPath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        const url = `http://localhost:${addr.port}/${path.basename(resolvedPath)}`;

        // Auto-close after 5 minutes
        setTimeout(() => {
          server.close();
        }, 5 * 60 * 1000);

        resolve(url);
      } else {
        reject(new Error("Failed to start server"));
      }
    });
    server.on("error", reject);
  });
}

/**
 * Parse code blocks from model response.
 */
export function extractCodeBlocks(
  text: string
): Array<{ language: string; code: string; filename?: string }> {
  const blocks: Array<{
    language: string;
    code: string;
    filename?: string;
  }> = [];
  const regex = /```(\w+)?(?:\s+(\S+))?\s*\n([\s\S]*?)```/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "text",
      filename: match[2],
      code: match[3].trim(),
    });
  }

  return blocks;
}

/**
 * Detect likely filename from language and content.
 */
export function suggestFilename(language: string, content: string): string {
  const langMap: Record<string, string> = {
    html: "index.html",
    css: "style.css",
    javascript: "script.js",
    js: "script.js",
    typescript: "index.ts",
    ts: "index.ts",
    python: "main.py",
    py: "main.py",
    json: "data.json",
    yaml: "config.yaml",
    yml: "config.yaml",
    markdown: "README.md",
    md: "README.md",
    bash: "script.sh",
    sh: "script.sh",
    powershell: "script.ps1",
    ps1: "script.ps1",
    rust: "main.rs",
    go: "main.go",
    java: "Main.java",
    cpp: "main.cpp",
    c: "main.c",
    php: "index.php",
    ruby: "main.rb",
    swift: "main.swift",
    kotlin: "Main.kt",
  };

  return langMap[language.toLowerCase()] || `output.${language}`;
}
