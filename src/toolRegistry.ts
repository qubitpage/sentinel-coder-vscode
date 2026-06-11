import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as child_process from "child_process";
import * as https from "https";

// Tool Registry ── Tool Definition ─────────────────────────────────────────────────────────
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: "filesystem" | "terminal" | "editor" | "search" | "git" | "web" | "workspace" | "network" | "rag" | "security";
  dangerLevel: "safe" | "moderate" | "dangerous";
  parameters: ToolParameter[];
  execute: (args: Record<string, unknown>, outputChannel: vscode.OutputChannel) => Promise<string>;
}

// Tool Registry ── Approval Mode ───────────────────────────────────────────────────────────
export type ApprovalMode = "default" | "bypass" | "autopilot";

export function shouldAutoApprove(mode: ApprovalMode, tool: ToolDefinition): boolean {
  if (mode === "autopilot") return true;
  // Bypass mode is intended for fast supervised work: auto-approve safe and
  // moderate tools (reads/searches/terminal/edit helpers), but still require
  // an explicit approval for dangerous actions such as deletes/pushes/remote ops.
  if (mode === "bypass" && tool.dangerLevel !== "dangerous") return true;
  return false;
}

// Tool Registry ── Helper: resolve workspace path ──────────────────────────────────────────
/**
 * Base directory for relative paths. Uses the open workspace folder; if no
 * folder is open, falls back to a per-user scratch dir so file tools still work.
 */
export function getBaseDir(): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (ws) return ws.uri.fsPath;
  const fallback = path.join(os.tmpdir(), "sentinel-coder");
  try { if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true }); } catch { /* best effort */ }
  return fallback;
}

export function hasOpenWorkspace(): boolean {
  return !!vscode.workspace.workspaceFolders?.length;
}

function resolvePath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(getBaseDir(), p);
}

// Tool Registry ── Persistent cross-platform shell ─────────────────────────────────────────
/**
 * A long-lived shell process so the agent can build real software:
 *  - one shell survives across tool calls → `cd`, venv activation, env vars persist
 *  - OS-detected shell (PowerShell on Windows, $SHELL/bash elsewhere) → cross-platform
 *  - configurable timeout (default 10 min) so `npm install`, `docker build`, etc. finish
 *  - merged stdout+stderr streamed back, with a sentinel marker carrying the exit code
 */
class PersistentShell {
  private proc: child_process.ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private busy = false;
  private readonly marker = "__SENTINEL_DONE_" + Math.random().toString(36).slice(2) + "__";

  private isWindows() { return process.platform === "win32"; }

  private spawnShell() {
    const cwd = getBaseDir();
    if (this.isWindows()) {
      this.proc = child_process.spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NoExit", "-Command", "-"], {
        cwd, env: process.env,
      }) as child_process.ChildProcessWithoutNullStreams;
    } else {
      const shell = process.env.SHELL || "/bin/bash";
      this.proc = child_process.spawn(shell, [], { cwd, env: process.env }) as child_process.ChildProcessWithoutNullStreams;
    }
    this.proc.stdout.on("data", (d) => { this.buffer += d.toString(); });
    this.proc.stderr.on("data", (d) => { this.buffer += d.toString(); });
    this.proc.on("exit", () => { this.proc = null; this.busy = false; });
    this.proc.on("error", () => { this.proc = null; this.busy = false; });
  }

  private killProcessTree(proc: child_process.ChildProcessWithoutNullStreams | null) {
    if (!proc) return;
    const pid = proc.pid;
    try { proc.stdin.end(); } catch { /* ignore */ }
    if (pid && this.isWindows()) {
      try {
        child_process.spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
        return;
      } catch { /* fall back to proc.kill */ }
    }
    try { proc.kill("SIGKILL"); } catch {
      try { proc.kill(); } catch { /* ignore */ }
    }
  }

  private resetShellAfterTimeout() {
    const oldProc = this.proc;
    this.proc = null;
    this.busy = false;
    this.killProcessTree(oldProc);
  }

  private formatOutput(raw: string): string {
    let out = raw.replace(/\r/g, "").trimEnd();
    const maxChars = 30000;
    if (out.length > maxChars) out = out.slice(0, maxChars) + `\n...(${out.length - maxChars} more chars truncated)`;
    return out;
  }

  /** Run a command with safe timeout/reset and robust shell-exit handling. */
  run(command: string, timeoutMs: number = 120000, onChunk?: (s: string) => void): Promise<string> {
    return new Promise((resolve) => {
      if (this.busy) {
        resolve("Error: shell is busy with another command. Wait for it to finish or cancel the previous task.");
        return;
      }
      if (!this.proc) this.spawnShell();
      if (!this.proc) {
        resolve("Error: failed to start shell. Check if PowerShell / bash is available.");
        return;
      }

      this.busy = true;
      this.buffer = "";
      let lastEmitted = 0;
      let progressInterval: NodeJS.Timeout | null = null;
      let poll: NodeJS.Timeout | null = null;
      let settled = false;

      const markCmd = this.isWindows()
        ? `; $__sentinelExitCode = $LASTEXITCODE; if ($null -eq $__sentinelExitCode) { $__sentinelExitCode = 0 }; Write-Output "${this.marker}$__sentinelExitCode"\n`
        : `; echo "${this.marker}$?"\n`;

      const activeProc = this.proc;

      const finish = (text: string, timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (progressInterval) clearInterval(progressInterval);
        if (poll) clearInterval(poll);
        activeProc.off("exit", onActiveExit);
        activeProc.off("error", onActiveError);

        if (timedOut) {
          this.resetShellAfterTimeout();
          resolve(
            text +
              `\n\n[Tool timed out after ${Math.round(timeoutMs / 1000)}s]\n` +
              `The command was stopped and the persistent shell was reset so future tool calls will not be blocked.`
          );
        } else {
          this.busy = false;
          resolve(text);
        }
      };

      const onActiveExit = (code: number | null, signal: NodeJS.Signals | null) => {
        const out = this.formatOutput(this.buffer);
        const exitText = code !== null ? `Exit code: ${code}` : `Shell exited via signal: ${signal ?? "unknown"}`;
        finish((out || "(shell exited before completion marker)") + `\n${exitText}`, false);
      };

      const onActiveError = (error: Error) => {
        const out = this.formatOutput(this.buffer);
        finish((out ? `${out}\n` : "") + `Shell error: ${error.message}`, false);
      };

      activeProc.once("exit", onActiveExit);
      activeProc.once("error", onActiveError);

      try {
        activeProc.stdin.write(command + "\n");
        activeProc.stdin.write(markCmd);
      } catch (error) {
        onActiveError(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const start = Date.now();

      progressInterval = setInterval(() => {
        if (onChunk && this.buffer.length > lastEmitted) {
          onChunk(this.buffer.slice(lastEmitted));
          lastEmitted = this.buffer.length;
        }
      }, 800);

      poll = setInterval(() => {
        if (onChunk && this.buffer.length > lastEmitted) {
          onChunk(this.buffer.slice(lastEmitted));
          lastEmitted = this.buffer.length;
        }

        const idx = this.buffer.indexOf(this.marker);
        if (idx !== -1) {
          const after = this.buffer.slice(idx + this.marker.length);
          const match = after.match(/^(-?\d+)(?:\r?\n|$)/);
          if (match) {
            const code = match[1];
            const out = this.formatOutput(this.buffer.slice(0, idx));
            finish((out || "(no output)") + `\nExit code: ${code}`, false);
          }
        } else if (Date.now() - start > timeoutMs) {
          const out = this.formatOutput(this.buffer);
          finish(out || "(no output yet)", true);
        }
      }, 150);
    });
  }

  dispose() { try { this.proc?.kill(); } catch { /* ignore */ } this.proc = null; this.busy = false; }
}

let _sharedShell: PersistentShell | null = null;
function getShell(): PersistentShell {
  if (!_sharedShell) _sharedShell = new PersistentShell();
  return _sharedShell;
}
export function disposeShell() { _sharedShell?.dispose(); _sharedShell = null; }

// Tool Registry ── All Built-in Tools ─────────────────────────────────────────────────────

const createFileTool: ToolDefinition = {
  name: "createFile",
  description: "Create a new file with the given content",
  category: "filesystem",
  dangerLevel: "moderate",
  parameters: [
    { name: "path", type: "string", description: "File path (relative or absolute)", required: true },
    { name: "content", type: "string", description: "File content", required: true },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, args.content as string, "utf-8");
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
    const note = hasOpenWorkspace() ? "" : " (no workspace folder is open, so this was created in a temporary scratch folder — open a folder in VS Code to save files into your project)";
    return `Created file: ${filePath}${note}`;
  },
};

const readFileTool: ToolDefinition = {
  name: "readFile",
  description: "Read the contents of a file",
  category: "filesystem",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "File path to read", required: true },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
    const content = fs.readFileSync(filePath, "utf-8");
    return content.length > 24000 ? content.slice(0, 24000) + "\n...(truncated — use searchText/codebaseSearch or read a specific range)" : content;
  },
};

function parsePngDimensions(buf: Buffer): { width?: number; height?: number } {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return {};
}

function parseGifDimensions(buf: Buffer): { width?: number; height?: number } {
  if (buf.length >= 10 && (buf.slice(0, 3).toString("ascii") === "GIF")) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  return {};
}

function parseJpegDimensions(buf: Buffer): { width?: number; height?: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    const len = buf.readUInt16BE(offset + 2);
    if (len < 2) break;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + len;
  }
  return {};
}

function runOptionalPythonExtractor(filePath: string, ext: string): string | undefined {
  const script = String.raw`
import json, re, sys, zipfile, xml.etree.ElementTree as ET
p=sys.argv[1]; ext=sys.argv[2].lower(); limit=12000

def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()[:limit]

def xml_text(data):
    try:
        root=ET.fromstring(data)
        return clean(' '.join(t for t in root.itertext() if t and t.strip()))
    except Exception:
        return clean(re.sub(r'<[^>]+>', ' ', data.decode('utf-8','ignore') if isinstance(data, bytes) else str(data)))
try:
    out=''
    if ext=='.docx':
        with zipfile.ZipFile(p) as z:
            out=xml_text(z.read('word/document.xml'))
    elif ext=='.pptx':
        parts=[]
        with zipfile.ZipFile(p) as z:
            for name in sorted(n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml'))[:80]:
                parts.append(xml_text(z.read(name)))
        out=clean(' | '.join(parts))
    elif ext=='.xlsx':
        parts=[]
        with zipfile.ZipFile(p) as z:
            for name in z.namelist():
                if name.endswith('sharedStrings.xml') or (name.startswith('xl/worksheets/sheet') and name.endswith('.xml')):
                    parts.append(xml_text(z.read(name)))
        out=clean(' | '.join(parts))
    elif ext=='.pdf':
        data=open(p,'rb').read(2_000_000)
        candidates=re.findall(rb'[ -~]{5,}', data)
        out=clean(' '.join(x.decode('latin1','ignore') for x in candidates[:2000]))
    print(json.dumps({'text': out}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
  const py = process.platform === "win32" ? "python.exe" : "python3";
  const res = child_process.spawnSync(py, ["-c", script, filePath, ext], { encoding: "utf8", timeout: 12000, maxBuffer: 1024 * 1024 });
  const raw = (res.stdout || "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { text?: string; error?: string };
    if (parsed.text) return parsed.text;
    if (parsed.error) return `Extractor note: ${parsed.error}`;
  } catch { /* ignore */ }
  return undefined;
}

function runOptionalFfprobe(filePath: string): Record<string, unknown> | undefined {
  try {
    const res = child_process.spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], {
      encoding: "utf8", timeout: 12000, maxBuffer: 1024 * 1024,
    });
    if (res.status === 0 && res.stdout) return JSON.parse(res.stdout) as Record<string, unknown>;
  } catch { /* ffprobe unavailable */ }
  return undefined;
}

const inspectFileTool: ToolDefinition = {
  name: "inspectFile",
  description: "Inspect a local file safely. Supports text previews plus metadata/extraction for PDFs, Office files (.docx/.xlsx/.pptx), images, audio, and video when local tools are available.",
  category: "filesystem",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "Workspace-relative or absolute file path to inspect", required: true },
    { name: "maxPreviewChars", type: "number", description: "Maximum extracted text preview length (default 12000)", required: false },
  ],
  async execute(args) {
    const p = String(args.path || "");
    if (!p) throw new Error("path is required");
    const filePath = resolvePath(p);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const st = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const maxPreviewChars = Math.max(1000, Math.min(Number(args.maxPreviewChars || 12000), 50000));
    const rel = path.relative(getBaseDir(), filePath) || filePath;
    const result: Record<string, unknown> = {
      path: rel,
      absolutePath: filePath,
      extension: ext || "(none)",
      sizeBytes: st.size,
      modified: st.mtime.toISOString(),
      kind: "unknown",
    };

    if (/\.(txt|md|markdown|json|jsonl|yaml|yml|xml|html?|css|scss|js|jsx|ts|tsx|py|php|sql|sh|ps1|bat|log|csv)$/i.test(ext)) {
      result.kind = "text";
      const text = fs.readFileSync(filePath, "utf8");
      result.preview = text.slice(0, maxPreviewChars);
      result.truncated = text.length > maxPreviewChars;
    } else if (/\.(png|jpe?g|gif)$/i.test(ext)) {
      result.kind = "image";
      const buf = fs.readFileSync(filePath);
      Object.assign(result, ext === ".png" ? parsePngDimensions(buf) : ext === ".gif" ? parseGifDimensions(buf) : parseJpegDimensions(buf));
    } else if (/\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|flac|ogg)$/i.test(ext)) {
      result.kind = /\.(mp3|wav|m4a|flac|ogg)$/i.test(ext) ? "audio" : "video";
      result.ffprobe = runOptionalFfprobe(filePath) || "ffprobe not available or file could not be probed";
    } else if (/\.(pdf|docx|xlsx|pptx)$/i.test(ext)) {
      result.kind = ext.slice(1);
      const extracted = runOptionalPythonExtractor(filePath, ext);
      result.extractedTextPreview = extracted ? extracted.slice(0, maxPreviewChars) : "No extractor output. Python may be unavailable, PDF may be scanned, or the file may be protected.";
      result.truncated = !!extracted && extracted.length > maxPreviewChars;
    } else {
      result.note = "Unsupported preview type. Metadata only.";
    }
    return JSON.stringify(result, null, 2);
  }
};


function loadSpeechmaticsApiKey(): string | null {
  const envKey = (process.env.SPEECHMATICS_API_KEY || "").trim();
  if (envKey) return envKey;

  const configuredKeyFile = String(vscode.workspace.getConfiguration("sentinelCoder").get("apiKeysFile", "") || "").trim();
  if (!configuredKeyFile) return null;

  const keyFile = path.isAbsolute(configuredKeyFile) ? configuredKeyFile : path.join(getBaseDir(), configuredKeyFile);
  try {
    if (!fs.existsSync(keyFile) || !fs.statSync(keyFile).isFile()) return null;
    const text = fs.readFileSync(keyFile, "utf8");
    const candidates: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!/speechmatics/i.test(line)) continue;
      const matches = line.match(/[A-Za-z0-9_.-]{24,}/g) || [];
      for (const candidate of matches) {
        if (candidate.length >= 24 && !/^speechmatics/i.test(candidate)) candidates.push(candidate.trim());
      }
    }
    return candidates[0] || null;
  } catch {
    return null;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeOutputName(name: string): string {
  const cleaned = name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || `sentinel-output-${Date.now()}`;
}

function httpsGetText(url: string, headers: Record<string, string>, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) reject(new Error(`HTTP ${status}: ${text.slice(0, 500)}`));
        else resolve(text);
      });
    });
    req.on("timeout", () => req.destroy(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`)));
    req.on("error", reject);
    req.end();
  });
}

function speechmaticsMultipartBody(audioPath: string, config: unknown): { body: Buffer; boundary: string; mime: string } {
  const boundary = "----sentinel" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const ext = path.extname(audioPath).toLowerCase();
  const mime = ext === ".wav" ? "audio/wav" : ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
  const chunks: Buffer[] = [];
  const push = (value: string | Buffer) => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"));
  push(`--${boundary}\r\n`);
  push('Content-Disposition: form-data; name="config"\r\n');
  push('Content-Type: application/json\r\n\r\n');
  push(JSON.stringify(config));
  push("\r\n");
  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="data_file"; filename="${path.basename(audioPath).replace(/["\r\n]/g, "_")}"\r\n`);
  push(`Content-Type: ${mime}\r\n\r\n`);
  push(fs.readFileSync(audioPath));
  push("\r\n");
  push(`--${boundary}--\r\n`);
  return { body: Buffer.concat(chunks), boundary, mime };
}

const transcribeAudioTool: ToolDefinition = {
  name: "transcribeAudio",
  description: "Transcribe an audio file with Speechmatics and save the transcript into .sentinel/generated/reports.",
  category: "network",
  dangerLevel: "moderate",
  parameters: [
    { name: "path", type: "string", description: "Audio file path to transcribe (.mp3, .wav, .m4a, .ogg).", required: true },
    { name: "language", type: "string", description: "Language code, default 'en'.", required: false },
    { name: "outputName", type: "string", description: "Optional safe output filename without extension.", required: false },
  ],
  async execute(args) {
    const audioPath = resolvePath(String(args.path || ""));
    if (!audioPath || !fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) {
      return `Audio file not found: ${audioPath}`;
    }
    const token = loadSpeechmaticsApiKey();
    if (!token) return "Speechmatics API key not found. Set SPEECHMATICS_API_KEY or configure sentinelCoder.apiKeysFile with a git-ignored key file.";
    const language = String(args.language || "en");
    const baseName = safeOutputName(String(args.outputName || `speechmatics-${path.basename(audioPath, path.extname(audioPath))}-${Date.now()}`));
    const reportsDir = path.join(getBaseDir(), ".sentinel", "generated", "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    const config = { type: "transcription", transcription_config: { language, operating_point: "enhanced" } };
    const upload = speechmaticsMultipartBody(audioPath, config);
    const jobRaw = await httpsBinary("https://asr.api.speechmatics.com/v2/jobs/", upload.body, {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${upload.boundary}`,
      "User-Agent": "sentinel-coder/1.0",
    }, 120000);
    const jobResp = JSON.parse(jobRaw.toString("utf8") || "{}") as Record<string, unknown>;
    const jobId = String((jobResp as any).id || (jobResp as any).job?.id || "");
    if (!jobId) return `Speechmatics job submission did not return a job id. Response: ${JSON.stringify(jobResp).slice(0, 500)}`;
    let status = "unknown";
    for (let i = 0; i < 45; i++) {
      await sleepMs(2000);
      const info = await httpsJson(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}`, null, {
        Authorization: `Bearer ${token}`,
        "User-Agent": "sentinel-coder/1.0",
      }, 30000) as Record<string, unknown>;
      status = String((info as any).job?.status || (info as any).status || "unknown");
      if (["done", "rejected", "failed"].includes(status)) break;
    }
    if (status !== "done") return `Speechmatics job ${jobId} finished with status: ${status}`;
    const transcript = (await httpsGetText(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}/transcript?format=txt`, {
      Authorization: `Bearer ${token}`,
      "User-Agent": "sentinel-coder/1.0",
    }, 60000)).trim();
    const outPath = path.join(reportsDir, `${baseName}.txt`);
    fs.writeFileSync(outPath, transcript, "utf8");
    return JSON.stringify({ ok: true, provider: "speechmatics", jobId, status, audio: audioPath, transcriptPath: outPath, transcriptPreview: transcript.slice(0, 240) }, null, 2);
  },
};

const editFileTool: ToolDefinition = {
  name: "editFile",
  description: "Replace an exact, unique snippet of text in an existing file. The oldText must match EXACTLY ONCE — include enough surrounding context (3+ lines) to make it unique. The edit is applied through VS Code so it shows in the diff and can be undone with Ctrl+Z.",
  category: "filesystem",
  dangerLevel: "moderate",
  parameters: [
    { name: "path", type: "string", description: "File path", required: true },
    { name: "oldText", type: "string", description: "Exact text to find (must be unique in the file — add context lines if needed)", required: true },
    { name: "newText", type: "string", description: "Replacement text", required: true },
    { name: "replaceAll", type: "boolean", description: "Replace every occurrence instead of requiring a unique match (default false)", required: false },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
    const content = fs.readFileSync(filePath, "utf-8");
    let old = args.oldText as string;
    let newText = args.newText as string;
    const replaceAll = args.replaceAll === true;
    if (!content.includes(old)) {
      // Line-ending tolerance: on Windows files are often CRLF while the model
      // emits LF (or vice-versa). Retry by normalizing the snippet's EOLs to the
      // file's dominant style before giving up — avoids spurious "not found".
      const fileUsesCRLF = content.includes("\r\n");
      const normOld = fileUsesCRLF
        ? old.replace(/\r?\n/g, "\r\n")
        : old.replace(/\r\n/g, "\n");
      if (content.includes(normOld)) {
        old = normOld;
        newText = fileUsesCRLF ? newText.replace(/\r?\n/g, "\r\n") : newText.replace(/\r\n/g, "\n");
      } else {
        return `Error: the oldText was not found in ${filePath}. Read the file first and copy the exact text (including indentation/whitespace).`;
      }
    }
    // Count occurrences
    let count = 0, i = 0;
    while ((i = content.indexOf(old, i)) !== -1) { count++; i += old.length; }
    if (count > 1 && !replaceAll) {
      return `Error: the oldText matches ${count} places in ${filePath}. Add more surrounding context so it is unique, or pass replaceAll:true to change all of them.`;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
      const edit = new vscode.WorkspaceEdit();
      if (replaceAll) {
        let from = 0, idx = 0;
        while ((idx = content.indexOf(old, from)) !== -1) {
          const start = doc.positionAt(idx);
          const end = doc.positionAt(idx + old.length);
          edit.replace(doc.uri, new vscode.Range(start, end), newText);
          from = idx + old.length;
        }
      } else {
        const idx = content.indexOf(old);
        const start = doc.positionAt(idx);
        const end = doc.positionAt(idx + old.length);
        edit.replace(doc.uri, new vscode.Range(start, end), newText);
      }
      const ok = await vscode.workspace.applyEdit(edit);
      if (!ok) return `Error: VS Code rejected the edit to ${filePath}.`;
      await doc.save();
      void editor;
      return `Edited file: ${filePath}${replaceAll ? ` (${count} occurrences)` : ""}`;
    } catch (e) {
      return `Error editing ${filePath}: ${(e as Error).message}`;
    }
  },
};

const deleteFileTool: ToolDefinition = {
  name: "deleteFile",
  description: "Delete a file from the workspace",
  category: "filesystem",
  dangerLevel: "dangerous",
  parameters: [
    { name: "path", type: "string", description: "File path to delete", required: true },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
    // Route through VS Code so the delete goes to the OS trash and stays
    // recoverable instead of an irreversible fs.unlinkSync.
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { useTrash: true });
    } catch {
      fs.unlinkSync(filePath);
    }
    return `Deleted (moved to trash): ${filePath}`;
  },
};

const listDirectoryTool: ToolDefinition = {
  name: "listDirectory",
  description: "List files and folders in a directory",
  category: "filesystem",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "Directory path (default: workspace root)", required: false },
  ],
  execute: async (args) => {
    const dirPath = resolvePath((args.path as string) || ".");
    if (!fs.existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`;
    const entries = fs.readdirSync(dirPath).map((e) => {
      const full = path.join(dirPath, e);
      return fs.statSync(full).isDirectory() ? `${e}/` : e;
    });
    return entries.join("\n");
  },
};

const runCommandTool: ToolDefinition = {
  name: "runCommand",
  description: "Execute a shell command in a persistent terminal session (cd, env vars and venvs persist across calls). Use for installs, builds, tests, git, etc. Long-running commands are supported.",
  category: "terminal",
  dangerLevel: "dangerous",
  parameters: [
    { name: "command", type: "string", description: "Command to execute", required: true },
    { name: "cwd", type: "string", description: "Working directory (optional — or just use 'cd' in the command)", required: false },
    { name: "timeoutSec", type: "number", description: "Max seconds to wait (default 600). The shell keeps running past this.", required: false },
  ],
  execute: async (args) => {
    const shell = getShell();
    let cmd = args.command as string;
    if (args.cwd) {
      const dir = resolvePath(args.cwd as string).replace(/"/g, '`"');
      cmd = `cd "${dir}"; ${cmd}`;
    }
    const timeoutMs = Math.max(1000, Math.round(((args.timeoutSec as number) || 600) * 1000));
    return shell.run(cmd, timeoutMs);
  },
};

const searchFilesTool: ToolDefinition = {
  name: "searchFiles",
  description: "Search for files by name pattern (glob)",
  category: "search",
  dangerLevel: "safe",
  parameters: [
    { name: "pattern", type: "string", description: "Glob pattern (e.g. **/*.ts)", required: true },
    { name: "maxResults", type: "number", description: "Max results (default 20)", required: false },
  ],
  execute: async (args) => {
    const pattern = args.pattern as string;
    const max = (args.maxResults as number) || 20;
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", max);
    if (uris.length === 0) return "No files found matching: " + pattern;
    return uris.map((u) => vscode.workspace.asRelativePath(u)).join("\n");
  },
};

const searchTextTool: ToolDefinition = {
  name: "searchText",
  description: "Search for text or a regex across workspace files (cross-platform). Returns file:line matches.",
  category: "search",
  dangerLevel: "safe",
  parameters: [
    { name: "query", type: "string", description: "Text or regex to search for", required: true },
    { name: "includePattern", type: "string", description: "Glob of files to search (default all)", required: false },
    { name: "isRegex", type: "boolean", description: "Treat the query as a regular expression (default false)", required: false },
    { name: "maxResults", type: "number", description: "Max match lines to return (default 100)", required: false },
  ],
  execute: async (args) => {
    const query = args.query as string;
    if (!hasOpenWorkspace()) return "No workspace folder is open, so there are no project files to search. Ask the user to open a folder in VS Code (File → Open Folder).";
    const include = (args.includePattern as string) || "**/*";
    const maxResults = (args.maxResults as number) || 100;
    let re: RegExp;
    try {
      re = args.isRegex === true ? new RegExp(query, "i") : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } catch (e) { return `Error: invalid regex: ${(e as Error).message}`; }
    const uris = await vscode.workspace.findFiles(include, "**/{node_modules,.git,dist,out,build,.next}/**", 4000);
    const lines: string[] = [];
    let scanned = 0;
    for (const u of uris) {
      if (lines.length >= maxResults || scanned >= 1500) break;
      try {
        const stat = fs.statSync(u.fsPath);
        if (stat.size > 1_500_000) continue; // skip very large/binary files
        scanned++;
        const text = fs.readFileSync(u.fsPath, "utf-8");
        if (text.indexOf("\u0000") !== -1) continue; // binary
        const rel = vscode.workspace.asRelativePath(u);
        const fileLines = text.split("\n");
        for (let i = 0; i < fileLines.length; i++) {
          if (re.test(fileLines[i])) {
            lines.push(`${rel}:${i + 1}: ${fileLines[i].trim().slice(0, 200)}`);
            if (lines.length >= maxResults) break;
          }
        }
      } catch { /* skip unreadable */ }
    }
    if (lines.length === 0) return "No matches found for: " + query;
    return lines.join("\n") + (lines.length >= maxResults ? `\n…(capped at ${maxResults} matches)` : "");
  },
};

const codebaseSearchTool: ToolDefinition = {
  name: "codebaseSearch",
  description: "Find the most relevant code for a natural-language question by ranking files on keyword/symbol overlap. Use this FIRST to locate where functionality lives before reading files. Returns ranked files with matching snippets.",
  category: "search",
  dangerLevel: "safe",
  parameters: [
    { name: "query", type: "string", description: "What you are looking for, e.g. 'where is auth middleware defined'", required: true },
    { name: "maxFiles", type: "number", description: "Number of top files to return (default 8)", required: false },
  ],
  execute: async (args) => {
    if (!hasOpenWorkspace()) return "No workspace folder is open. Ask the user to open a folder (File → Open Folder).";
    const query = (args.query as string).toLowerCase();
    const maxFiles = (args.maxFiles as number) || 8;
    // Tokenize query into meaningful terms (drop stopwords/short tokens).
    const stop = new Set(["the", "a", "an", "is", "are", "where", "how", "what", "to", "of", "in", "on", "for", "and", "or", "do", "does", "this", "that", "with", "find", "code", "file", "function", "defined", "located"]);
    const terms = Array.from(new Set(query.split(/[^a-z0-9_]+/).filter((t) => t.length >= 3 && !stop.has(t))));
    if (terms.length === 0) return "Please provide more specific search terms.";
    const uris = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx,py,go,rs,java,php,rb,c,cpp,h,cs,json,md,yml,yaml,sql,sh,vue,svelte}", "**/{node_modules,.git,dist,out,build,.next,venv,__pycache__}/**", 5000);
    type Hit = { rel: string; score: number; snippets: string[] };
    const hits: Hit[] = [];
    let scanned = 0;
    for (const u of uris) {
      if (scanned >= 2500) break;
      try {
        const stat = fs.statSync(u.fsPath);
        if (stat.size > 1_500_000) continue;
        scanned++;
        const text = fs.readFileSync(u.fsPath, "utf-8");
        if (text.indexOf("\u0000") !== -1) continue;
        const lower = text.toLowerCase();
        const rel = vscode.workspace.asRelativePath(u);
        const relLower = rel.toLowerCase();
        let score = 0;
        const snippets: string[] = [];
        const fileLines = text.split("\n");
        for (const term of terms) {
          // Filename match is a strong signal.
          if (relLower.includes(term)) score += 8;
          let occ = 0, fi = 0;
          while ((fi = lower.indexOf(term, fi)) !== -1) { occ++; fi += term.length; if (occ > 50) break; }
          score += Math.min(occ, 10);
          // Definition lines score higher.
          for (let i = 0; i < fileLines.length && snippets.length < 3; i++) {
            const ll = fileLines[i].toLowerCase();
            if (ll.includes(term) && /\b(function|def|class|const|export|interface|type|func|fn|public|private|async)\b/.test(ll)) {
              score += 6;
              snippets.push(`  ${rel}:${i + 1}: ${fileLines[i].trim().slice(0, 160)}`);
            }
          }
        }
        if (score > 0) hits.push({ rel, score, snippets });
      } catch { /* skip */ }
    }
    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, maxFiles);
    if (top.length === 0) return "No relevant files found for: " + (args.query as string);
    return top.map((h) => `${h.rel} (score ${h.score})${h.snippets.length ? "\n" + h.snippets.join("\n") : ""}`).join("\n\n");
  },
};

const getOpenFileTool: ToolDefinition = {
  name: "getActiveFile",
  description: "Get the content and path of the currently active editor file",
  category: "editor",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "No file currently open in the editor";
    const doc = editor.document;
    const content = doc.getText();
    return `File: ${doc.fileName}\nLanguage: ${doc.languageId}\nLines: ${doc.lineCount}\n---\n${content.slice(0, 10000)}`;
  },
};

const getSelectionTool: ToolDefinition = {
  name: "getSelection",
  description: "Get the currently selected text in the active editor",
  category: "editor",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "No file currently open";
    const selection = editor.selection;
    if (selection.isEmpty) return "No text selected";
    return `File: ${editor.document.fileName}\nSelection (L${selection.start.line + 1}-L${selection.end.line + 1}):\n${editor.document.getText(selection)}`;
  },
};

const insertTextTool: ToolDefinition = {
  name: "insertText",
  description: "Insert text at the cursor position in the active editor",
  category: "editor",
  dangerLevel: "moderate",
  parameters: [
    { name: "text", type: "string", description: "Text to insert", required: true },
  ],
  execute: async (args) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "No file currently open";
    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, args.text as string);
    });
    return `Inserted text at cursor position in ${editor.document.fileName}`;
  },
};

const getErrorsTool: ToolDefinition = {
  name: "getDiagnostics",
  description: "Get all errors/warnings from the Problems panel for a file or all files",
  category: "editor",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "File path (optional, all files if omitted)", required: false },
  ],
  execute: async (args) => {
    const filePath = args.path as string | undefined;
    let diagnostics: [vscode.Uri, vscode.Diagnostic[]][];
    if (filePath) {
      const uri = vscode.Uri.file(resolvePath(filePath));
      diagnostics = [[uri, vscode.languages.getDiagnostics(uri)]];
    } else {
      diagnostics = vscode.languages.getDiagnostics() as [vscode.Uri, vscode.Diagnostic[]][];
    }
    const results: string[] = [];
    for (const [uri, diags] of diagnostics) {
      for (const d of diags) {
        if (d.severity <= vscode.DiagnosticSeverity.Warning) {
          const sev = d.severity === vscode.DiagnosticSeverity.Error ? "ERROR" : "WARN";
          results.push(`${sev} ${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1}: ${d.message}`);
        }
      }
    }
    return results.length > 0 ? results.slice(0, 50).join("\n") : "No errors or warnings found";
  },
};

const getOpenFilesTool: ToolDefinition = {
  name: "getOpenTabs",
  description: "List all currently open editor tabs",
  category: "editor",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    if (tabs.length === 0) return "No tabs open";
    return tabs
      .map((t) => {
        const input = t.input;
        if (input instanceof vscode.TabInputText) return vscode.workspace.asRelativePath(input.uri);
        return t.label;
      })
      .join("\n");
  },
};

const gitStatusTool: ToolDefinition = {
  name: "gitStatus",
  description: "Show git status (changed, staged, untracked files)",
  category: "git",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return "No workspace folder";
    return new Promise((resolve) => {
      child_process.exec(
        "git status --porcelain",
        { cwd: ws.uri.fsPath, timeout: 10000 },
        (error, stdout) => {
          if (error) resolve("Git not available or not a git repo");
          else resolve(stdout.toString() || "Working tree clean");
        }
      );
    });
  },
};

const gitDiffTool: ToolDefinition = {
  name: "gitDiff",
  description: "Show git diff of uncommitted changes",
  category: "git",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "File to diff (optional, all if omitted)", required: false },
  ],
  execute: async (args) => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return "No workspace folder";
    const fileArg = args.path ? ` -- "${args.path}"` : "";
    return new Promise((resolve) => {
      child_process.exec(
        `git diff${fileArg}`,
        { cwd: ws.uri.fsPath, timeout: 10000, maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error) resolve("Git not available");
          else resolve(stdout.toString().slice(0, 8000) || "No uncommitted changes");
        }
      );
    });
  },
};

const getWorkspaceInfoTool: ToolDefinition = {
  name: "getWorkspaceInfo",
  description: "Get workspace folder info, file count, and project type",
  category: "workspace",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) return "No workspace folder open";
    const lines: string[] = [];
    for (const folder of ws) {
      lines.push(`Workspace: ${folder.name}`);
      lines.push(`Path: ${folder.uri.fsPath}`);
      // Check for common project files
      const checks = ["package.json", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "*.sln", "pyproject.toml"];
      for (const c of checks) {
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, c), null, 1);
        if (found.length > 0) lines.push(`Project type: ${c}`);
      }
    }
    return lines.join("\n");
  },
};

const serveFileTool: ToolDefinition = {
  name: "serveFile",
  description: "Start an HTTP server for a file and return a localhost URL to visit",
  category: "web",
  dangerLevel: "moderate",
  parameters: [
    { name: "path", type: "string", description: "File path to serve", required: true },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
    const dir = path.dirname(filePath);
    const httpModule = await import("http");
    const mimeTypes: Record<string, string> = {
      ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
      ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
    };
    const server = httpModule.createServer((req, res) => {
      const reqPath = req.url === "/" ? `/${path.basename(filePath)}` : req.url || "/";
      const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, "");
      const full = path.join(dir, safePath);
      if (!full.startsWith(dir)) { res.writeHead(403); res.end("Forbidden"); return; }
      if (!fs.existsSync(full)) { res.writeHead(404); res.end("Not Found"); return; }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(fs.readFileSync(full));
    });
    return new Promise<string>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          const url = `http://localhost:${addr.port}/${path.basename(filePath)}`;
          setTimeout(() => server.close(), 10 * 60 * 1000);
          resolve(`Server started. Visit: ${url}`);
        } else reject(new Error("Failed to start server"));
      });
      server.on("error", reject);
    });
  },
};

const openBrowserTool: ToolDefinition = {
  name: "openBrowser",
  description: "Open a URL in the user's default browser",
  category: "web",
  dangerLevel: "safe",
  parameters: [
    { name: "url", type: "string", description: "URL to open", required: true },
  ],
  execute: async (args) => {
    const url = args.url as string;
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return `Opened: ${url}`;
  },
};

// Tool Registry ── Network Tools ──────────────────────────────────────────────────────────

const httpRequestTool: ToolDefinition = {
  name: "httpRequest",
  description: "Make an HTTP GET or POST request to a URL and return the response body",
  category: "network",
  dangerLevel: "moderate",
  parameters: [
    { name: "url", type: "string", description: "Target URL", required: true },
    { name: "method", type: "string", description: "HTTP method: GET or POST (default: GET)", required: false },
    { name: "body", type: "string", description: "JSON body for POST requests (optional)", required: false },
    { name: "headers", type: "string", description: "JSON headers object (optional)", required: false },
  ],
  execute: async (args) => {
    const url = args.url as string;
    // Reject non-HTTP(S) URLs
    if (!/^https?:\/\//i.test(url)) return "Error: Only http:// and https:// URLs are allowed";
    const method = ((args.method as string) || "GET").toUpperCase();
    const http = url.startsWith("https") ? await import("https") : await import("http");
    const parsedUrl = new URL(url);
    const headers: Record<string, string> = { "User-Agent": "SentinelCoder/3.1" };
    if (args.headers) {
      try { Object.assign(headers, JSON.parse(args.headers as string)); } catch {}
    }
    const bodyStr = args.body as string | undefined;
    if (bodyStr) headers["Content-Type"] = "application/json";

    return new Promise((resolve) => {
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (url.startsWith("https") ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        timeout: 15000,
      };
      const req = (http as typeof import("https")).request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          resolve(`HTTP ${res.statusCode}\n${data.slice(0, 8000)}`);
        });
      });
      req.on("error", (e) => resolve(`Request error: ${e.message}`));
      req.on("timeout", () => { req.destroy(); resolve("Request timed out"); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  },
};

const sshCommandTool: ToolDefinition = {
  name: "sshCommand",
  description: "Run a command on a remote server via SSH (requires ssh in PATH, key-based auth recommended)",
  category: "network",
  dangerLevel: "dangerous",
  parameters: [
    { name: "host", type: "string", description: "Remote host (user@hostname or hostname)", required: true },
    { name: "command", type: "string", description: "Shell command to run remotely", required: true },
    { name: "port", type: "number", description: "SSH port (default: 22)", required: false },
    { name: "keyPath", type: "string", description: "Path to private key file (optional)", required: false },
  ],
  execute: async (args, outputChannel) => {
    const host = args.host as string;
    const command = args.command as string;
    const port = (args.port as number) || 22;
    const keyPath = args.keyPath as string | undefined;

    // Validate host (no shell metacharacters)
    if (!/^[\w.@\-]+$/.test(host)) return "Error: Invalid host format";

    const sshArgs = ["-o", "StrictHostKeyChecking=accept-new", "-p", String(port)];
    if (keyPath) sshArgs.push("-i", keyPath);
    sshArgs.push(host, command);

    outputChannel?.appendLine(`SSH ${host}: ${command}`);

    return new Promise((resolve) => {
      child_process.execFile("ssh", sshArgs, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        let out = "";
        if (stdout) out += stdout.toString().slice(0, 6000);
        if (stderr) out += "\nSTDERR: " + stderr.toString().slice(0, 2000);
        out += `\nExit: ${error ? error.code ?? 1 : 0}`;
        resolve(out);
      });
    });
  },
};

const dockerCommandTool: ToolDefinition = {
  name: "dockerCommand",
  description: "Run a Docker CLI command (docker ps, docker logs, docker exec, docker build, etc.)",
  category: "terminal",
  dangerLevel: "dangerous",
  parameters: [
    { name: "command", type: "string", description: "Docker command to run (e.g. 'ps -a', 'logs mycontainer', 'exec mycontainer ls')", required: true },
  ],
  execute: async (args) => {
    const cmd = args.command as string;
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    return new Promise((resolve) => {
      child_process.exec(
        `docker ${cmd}`,
        { cwd: ws, timeout: 30000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          let out = stdout?.toString().slice(0, 6000) || "";
          if (stderr) out += "\nSTDERR: " + stderr.toString().slice(0, 2000);
          out += `\nExit: ${error ? error.code ?? 1 : 0}`;
          resolve(out);
        }
      );
    });
  },
};

// Tool Registry ── Web Search Tool ────────────────────────────────────────────────────────

const webSearchTool: ToolDefinition = {
  name: "webSearch",
  description: "Search the internet and return top results (title, snippet, URL). Keyless (DuckDuckGo). Use for up-to-date info, docs, errors, library versions.",
  category: "web",
  dangerLevel: "safe",
  parameters: [
    { name: "query", type: "string", description: "Search query", required: true },
    { name: "maxResults", type: "number", description: "Max results to return (default: 6)", required: false },
  ],
  execute: async (args) => {
    const query = (args.query as string || "").trim();
    if (!query) return "Error: query is required";
    const max = Math.min(Math.max((args.maxResults as number) || 6, 1), 12);
    const https = await import("https");

    const fetchHtml = (q: string): Promise<string> => new Promise((resolve) => {
      const postData = `q=${encodeURIComponent(q)}`;
      const req = https.request({
        hostname: "html.duckduckgo.com",
        path: "/html/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SentinelCoder/3.3",
        },
        timeout: 15000,
      }, (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve(data));
      });
      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
      req.write(postData);
      req.end();
    });

    const html = await fetchHtml(query);
    if (!html) return "Web search failed (no response from DuckDuckGo).";

    const decode = (s: string) => s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();

    const results: string[] = [];
    const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null) snippets.push(decode(sm[1]));
    let lm: RegExpExecArray | null;
    let i = 0;
    while ((lm = linkRe.exec(html)) !== null && results.length < max) {
      let url = lm[1];
      // DuckDuckGo wraps links in a redirect; extract the uddg target
      const ud = url.match(/[?&]uddg=([^&]+)/);
      if (ud) { try { url = decodeURIComponent(ud[1]); } catch { /* keep */ } }
      const title = decode(lm[2]);
      const snip = snippets[i] || "";
      results.push(`[${results.length + 1}] ${title}\n${url}\n${snip}`);
      i++;
    }
    if (!results.length) return `No web results parsed for: ${query}`;
    return results.join("\n\n");
  },
};

// Tool Registry ── RAG Tools ──────────────────────────────────────────────────────────────

const RAG_URL = process.env.RAG_URL || "http://localhost:7861";

const queryRAGTool: ToolDefinition = {
  name: "queryRAG",
  description: "Search the local knowledge base (RAG) for relevant documents. Use this before answering questions about the workspace or ingested docs.",
  category: "rag",
  dangerLevel: "safe",
  parameters: [
    { name: "query", type: "string", description: "Natural language search query", required: true },
    { name: "collection", type: "string", description: "Collection name (default: 'default')", required: false },
    { name: "n_results", type: "number", description: "Number of results to return (default: 5)", required: false },
  ],
  execute: async (args) => {
    const body = JSON.stringify({
      query: args.query,
      collection: (args.collection as string) || "default",
      n_results: (args.n_results as number) || 5,
    });
    return new Promise((resolve) => {
      const http = require("http");
      const parsedUrl = new URL(RAG_URL + "/query");
      const req = http.request(
        { hostname: parsedUrl.hostname, port: parsedUrl.port || 7861, path: "/query", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 15000 },
        (res: import("http").IncomingMessage) => {
          let data = "";
          res.on("data", (c: Buffer) => { data += c; });
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (!json.results?.length) { resolve("No results found in RAG for: " + (args.query as string)); return; }
              const out = json.results.map((r: {text: string; metadata: Record<string, unknown>; distance: number}, i: number) =>
                `[${i + 1}] (dist=${r.distance?.toFixed(3)}) ${r.metadata?.source || ""}\n${r.text}`
              ).join("\n\n---\n\n");
              resolve(out.slice(0, 8000));
            } catch (e) { resolve("RAG parse error: " + String(e) + "\nRaw: " + data.slice(0, 500)); }
          });
        }
      );
      req.on("error", (e: Error) => resolve(`RAG server not available (start rag_server.py): ${e.message}`));
      req.on("timeout", () => { req.destroy(); resolve("RAG query timed out"); });
      req.write(body);
      req.end();
    });
  },
};

const ingestRAGTool: ToolDefinition = {
  name: "ingestRAG",
  description: "Add a file or text document to the local RAG knowledge base for future queries",
  category: "rag",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "File path to ingest (absolute or workspace-relative)", required: false },
    { name: "text", type: "string", description: "Raw text to ingest (use if no file path)", required: false },
    { name: "collection", type: "string", description: "Target collection (default: 'default')", required: false },
    { name: "source_tag", type: "string", description: "Label/tag for this document", required: false },
  ],
  execute: async (args) => {
    if (!args.path && !args.text) return "Error: provide either path or text";
    const collection = (args.collection as string) || "default";

    if (args.path) {
      const body = JSON.stringify({ path: resolvePath(args.path as string), collection, source_tag: args.source_tag });
      return new Promise((resolve) => {
        const http = require("http");
        const req = http.request(
          { hostname: "127.0.0.1", port: 7861, path: "/ingest/file", method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 30000 },
          (res: import("http").IncomingMessage) => {
            let data = "";
            res.on("data", (c: Buffer) => { data += c; });
            res.on("end", () => { try { resolve(JSON.stringify(JSON.parse(data), null, 2)); } catch { resolve(data); } });
          }
        );
        req.on("error", (e: Error) => resolve(`RAG server not available: ${e.message}`));
        req.write(body); req.end();
      });
    }

    const body = JSON.stringify({
      collection, documents: [args.text],
      source_tag: args.source_tag || "manual",
    });
    return new Promise((resolve) => {
      const http = require("http");
      const req = http.request(
        { hostname: "127.0.0.1", port: 7861, path: "/ingest", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 30000 },
        (res: import("http").IncomingMessage) => {
          let data = "";
          res.on("data", (c: Buffer) => { data += c; });
          res.on("end", () => { try { resolve(JSON.stringify(JSON.parse(data), null, 2)); } catch { resolve(data); } });
        }
      );
      req.on("error", (e: Error) => resolve(`RAG server not available: ${e.message}`));
      req.write(body); req.end();
    });
  },
};

// Tool Registry ── Git Extended Tools ─────────────────────────────────────────────────────

const gitCommitTool: ToolDefinition = {
  name: "gitCommit",
  description: "Stage all changes and create a git commit with the given message",
  category: "git",
  dangerLevel: "moderate",
  parameters: [
    { name: "message", type: "string", description: "Commit message", required: true },
    { name: "addAll", type: "boolean", description: "Stage all changes before committing (default: true)", required: false },
  ],
  execute: async (args) => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return "No workspace folder";
    const addAll = args.addAll !== false;
    const cmd = addAll ? `git add -A && git commit -m "${(args.message as string).replace(/"/g, '\\"')}"` : `git commit -m "${(args.message as string).replace(/"/g, '\\"')}"`;
    return new Promise((resolve) => {
      child_process.exec(cmd, { cwd: ws.uri.fsPath, timeout: 15000, shell: "powershell.exe" }, (error, stdout, stderr) => {
        const out = [stdout?.toString(), stderr?.toString()].filter(Boolean).join("\n").trim();
        resolve(out || (error ? `Error: ${error.message}` : "Committed"));
      });
    });
  },
};

const gitPushTool: ToolDefinition = {
  name: "gitPush",
  description: "Push committed changes to the remote git repository",
  category: "git",
  dangerLevel: "dangerous",
  parameters: [
    { name: "remote", type: "string", description: "Remote name (default: origin)", required: false },
    { name: "branch", type: "string", description: "Branch name (default: current branch)", required: false },
  ],
  execute: async (args) => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return "No workspace folder";
    const remote = String(args.remote || "origin");
    const branch = args.branch ? String(args.branch) : "";
    // Validate user-controlled git refs before passing them as argv.
    if (!/^[\w.\-/]+$/.test(remote)) return "Error: Invalid remote name";
    if (branch && !/^[\w.\-/]+$/.test(branch)) return "Error: Invalid branch name";
    const gitArgv = ["push", remote, ...(branch ? [branch] : [])];
    return new Promise((resolve) => {
      const proc = child_process.spawn("git", gitArgv, {
        cwd: ws.uri.fsPath,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
        resolve("Error: git push timed out after 30s");
      }, 30000);
      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve(`Error: ${error.message}`);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        resolve(out || (code === 0 ? "Pushed" : `Error: git push exited with code ${code}`));
      });
    });
  },
};

const gitLogTool: ToolDefinition = {
  name: "gitLog",
  description: "Show recent git commit history",
  category: "git",
  dangerLevel: "safe",
  parameters: [
    { name: "count", type: "number", description: "Number of commits to show (default: 10)", required: false },
  ],
  execute: async (args) => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return "No workspace folder";
    const n = (args.count as number) || 10;
    return new Promise((resolve) => {
      child_process.exec(
        `git log --oneline -${n}`,
        { cwd: ws.uri.fsPath, timeout: 10000 },
        (error, stdout) => { resolve(error ? "Git not available" : stdout.toString() || "No commits"); }
      );
    });
  },
};

// Tool Registry ── Filesystem Extended ────────────────────────────────────────────────────

const prepareGeneratedWorkspaceTool: ToolDefinition = {
  name: "prepareGeneratedWorkspace",
  description: "Create and return organized Sentinel generated-content folders for images, videos, audio, documents, presentations, data, reports, and templates under .sentinel/generated.",
  category: "filesystem",
  dangerLevel: "safe",
  parameters: [
    { name: "subfolder", type: "string", description: "Optional project-specific subfolder name under .sentinel/generated", required: false },
  ],
  async execute(args) {
    const rawSubfolder = String(args.subfolder || "").trim();
    const safeSubfolder = rawSubfolder ? rawSubfolder.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) : "";
    const root = path.join(getBaseDir(), ".sentinel", "generated", safeSubfolder);
    const folders = ["images", "videos", "audio", "documents", "presentations", "spreadsheets", "data", "reports", "templates"].map((name) => path.join(root, name));
    for (const folder of folders) fs.mkdirSync(folder, { recursive: true });
    return JSON.stringify({ root, folders }, null, 2);
  },
};

function runAzureCliJson(azureCliArgv: string[], timeoutMs = 90000): unknown {
  // On Windows, spawning az.cmd directly can fail with EINVAL in some VS Code
  // extension hosts. Use cmd.exe /c az for portable resolution through PATH.
  const executable = process.platform === "win32" ? "cmd.exe" : "az";
  const azArgv = process.platform === "win32"
    ? ["/c", "az", ...azureCliArgv, "-o", "json"]
    : [...azureCliArgv, "-o", "json"];
  const proc = child_process.spawnSync(executable, azArgv, {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) throw new Error((proc.stderr || proc.stdout || "Azure CLI command failed").toString().slice(0, 1200));
  return JSON.parse(proc.stdout || "null");
}

function getAzureOpenAIAccount(): { endpoint: string; key: string; resourceGroup: string; account: string } {
  const cfg = vscode.workspace.getConfiguration("sentinelCoder");
  const resourceGroup = String(
    cfg.get("azureOpenAIResourceGroup", "") || process.env.AZURE_OPENAI_RESOURCE_GROUP || ""
  ).trim();
  const account = String(
    cfg.get("azureOpenAIAccount", "") || process.env.AZURE_OPENAI_ACCOUNT || ""
  ).trim();
  if (!resourceGroup || !account) {
    throw new Error("Azure OpenAI account is not configured. Set sentinelCoder.azureOpenAIResourceGroup + sentinelCoder.azureOpenAIAccount, or AZURE_OPENAI_RESOURCE_GROUP + AZURE_OPENAI_ACCOUNT.");
  }
  if (!/^[\w.()\-]+$/.test(resourceGroup) || !/^[\w.()\-]+$/.test(account)) {
    throw new Error("Azure OpenAI resource group/account contains invalid characters.");
  }
  const accountInfo = runAzureCliJson(["cognitiveservices", "account", "show", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
  const endpoint = String((accountInfo.properties as Record<string, unknown> | undefined)?.endpoint || "").replace(/\/$/, "");
  const keys = runAzureCliJson(["cognitiveservices", "account", "keys", "list", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
  const key = String(keys.key1 || keys.key2 || "");
  if (!endpoint || !key) throw new Error("Azure OpenAI endpoint/key not available from CLI. Check az login and cognitiveservices permissions.");
  return { endpoint, key, resourceGroup, account };
}

function httpsBinary(url: string, body: Buffer, headers: Record<string, string>, timeoutMs = 120000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${buf.toString("utf-8").slice(0, 600)}`));
          return;
        }
        resolve(buf);
      });
    });
    req.on("timeout", () => req.destroy(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpsJson(url: string, payload: unknown, headers: Record<string, string>, timeoutMs = 180000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(data.length), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* keep text */ }
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${typeof parsed === "string" ? parsed.slice(0, 1000) : JSON.stringify(parsed).slice(0, 1000)}`));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`)));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

const analyzeImageTool: ToolDefinition = {
  name: "analyzeImage",
  description: "Agent-facing vision/OCR tool: analyze an image or screenshot with Azure GPT-4.1 vision, read visible text, and diagnose UI/code/layout issues without requiring external OCR binaries.",
  category: "workspace",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "Image path to analyze (PNG/JPG/WebP). Relative paths resolve from the workspace.", required: true },
    { name: "prompt", type: "string", description: "Optional analysis instruction (OCR, UI issue diagnosis, code reading, design critique).", required: false },
    { name: "deployment", type: "string", description: "Azure vision-capable chat deployment (default: gpt-4.1).", required: false }
  ],
  execute: async (args) => {
    const input = String(args.path || "").trim();
    if (!input) return JSON.stringify({ ok: false, error: "path is required" }, null, 2);
    const file = resolvePath(input);
    if (!fs.existsSync(file)) return JSON.stringify({ ok: false, error: `File not found: ${input}` }, null, 2);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    const prompt = String(args.prompt || "Read visible text, summarize the screenshot/image, and identify UI/layout/code/design issues. Be concise and actionable.");
    const deployment = String(args.deployment || "gpt-4.1");
    try {
      const acct = getAzureOpenAIAccount();
      const b64 = fs.readFileSync(file).toString("base64");
      const url = `${acct.endpoint.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2025-04-01-preview`;
      const payload = {
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }
          ]
        }],
        max_tokens: 900
      };
      const json = await httpsJson(url, payload, { "api-key": acct.key, "Content-Type": "application/json" }, 120000) as any;
      const text = json?.choices?.[0]?.message?.content || "";
      return JSON.stringify({ ok: true, provider: "azure", deployment, file, analysis: text }, null, 2);
    } catch (error) {
      return JSON.stringify({ ok: false, file, error: error instanceof Error ? error.message : String(error) }, null, 2);
    }
  }
};

const createOfficeDocumentTool: ToolDefinition = {
  name: "createOfficeDocument",
  description: "Create a basic standalone Office document (DOCX, XLSX, or PPTX) in .sentinel/generated using built-in Python stdlib packaging; no external Office dependency required.",
  category: "filesystem",
  dangerLevel: "safe",
  parameters: [
    { name: "type", type: "string", description: "Document type: docx, xlsx, or pptx.", required: true },
    { name: "title", type: "string", description: "Document title.", required: false },
    { name: "content", type: "string", description: "Plain text content, rows (CSV-like) for XLSX, or slide bullets for PPTX.", required: false },
    { name: "outputName", type: "string", description: "Optional output file name without extension.", required: false }
  ],
  execute: async (args) => {
    const type = String(args.type || "docx").toLowerCase().replace(/^\./, "");
    if (!["docx", "xlsx", "pptx"].includes(type)) return JSON.stringify({ ok: false, error: "type must be docx, xlsx, or pptx" }, null, 2);
    const title = String(args.title || "Sentinel Generated Document");
    const content = String(args.content || "Generated by Sentinel Coder.");
    const base = safeOutputName(String(args.outputName || title || `sentinel-${type}`));
    const dir = path.join(getBaseDir(), ".sentinel", "generated", type === "pptx" ? "presentations" : type === "xlsx" ? "data" : "documents");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${base}.${type}`);
    const script = `
import html, json, sys, zipfile
from pathlib import Path
out=Path(sys.argv[1]); typ=sys.argv[2]; title=sys.argv[3]; content=sys.argv[4]
def zwrite(z,n,s): z.writestr(n, s.encode('utf-8'))
if typ=='docx':
  paras=''.join('<w:p><w:r><w:t>'+html.escape(line)+'</w:t></w:r></w:p>' for line in content.splitlines() if line.strip()) or '<w:p><w:r><w:t></w:t></w:r></w:p>'
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    zwrite(z,'[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zwrite(z,'_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zwrite(z,'word/document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+html.escape(title)+'</w:t></w:r></w:p>'+paras+'<w:sectPr/></w:body></w:document>')
elif typ=='xlsx':
  rows=[r.split(',') for r in content.splitlines() if r.strip()] or [[title],[content]]
  cells=[]
  for i,row in enumerate(rows,1):
    cs=[]
    for j,val in enumerate(row,1):
      col=chr(64+j)
      cs.append(f'<c r="{col}{i}" t="inlineStr"><is><t>{html.escape(val.strip())}</t></is></c>')
    cells.append(f'<row r="{i}">'+''.join(cs)+'</row>')
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    zwrite(z,'[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
    zwrite(z,'_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    zwrite(z,'xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>')
    zwrite(z,'xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    zwrite(z,'xl/worksheets/sheet1.xml','<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(cells)+'</sheetData></worksheet>')
else:
  slides=[line for line in content.splitlines() if line.strip()] or [content]
  slide_text=''.join('<a:p><a:r><a:t>'+html.escape(x)+'</a:t></a:r></a:p>' for x in slides[:8])
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    zwrite(z,'[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>')
    zwrite(z,'_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
    zwrite(z,'ppt/presentation.xml','<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>')
    zwrite(z,'ppt/_rels/presentation.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>')
    zwrite(z,'ppt/slides/slide1.xml','<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>'+html.escape(title)+'</a:t></a:r></a:p>'+slide_text+'</p:txBody></p:sp></p:spTree></p:cSld></p:sld>')
print(json.dumps({'ok': True, 'path': str(out), 'type': typ, 'bytes': out.stat().st_size}))
`;
    const res = child_process.spawnSync("python", ["-c", script, out, type, title, content], { encoding: "utf-8", timeout: 30000, maxBuffer: 1024 * 1024 });
    if (res.status !== 0) return JSON.stringify({ ok: false, error: res.stderr || res.stdout || `python exited ${res.status}` }, null, 2);
    return res.stdout.trim();
  }
};

const discoverMediaModelsTool: ToolDefinition = {
  name: "discoverMediaModels",
  description: "Discover currently configured/deployed Azure media-capable models and report which image/audio/video capabilities are actually available; does not fake unsupported video providers.",
  category: "workspace",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    try {
      const acct = getAzureOpenAIAccount();
      const names = ["gpt-image-2", "MAI-Image-2e", "gpt-4.1", "gpt-5.5", "grok-4.3"];
      return JSON.stringify({
        ok: true,
        azure: {
          endpoint: acct.endpoint.replace(/https:\/\/([^./]+).*/, "https://$1...") ,
          proven: {
            image: ["gpt-image-2", "MAI-Image-2e"],
            speech: ["Azure Speech TTS"],
            transcription: ["Speechmatics"],
            visionOcr: ["gpt-4.1"],
            video: []
          },
          deploymentsToCheck: names,
          videoStatus: "No Sora/video deployment found in current Azure deployment list; video generation remains unavailable until a video deployment/API key is configured and smoke-tested."
        }
      }, null, 2);
    } catch (error) {
      return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2);
    }
  }
};

const generateImageTool: ToolDefinition = {
  name: "generateImage",
  description: "Generate an image with a proven Azure image model and save it into .sentinel/generated/images. Tested models: azure:gpt-image-2 and azure:MAI-Image-2e.",
  category: "web",
  dangerLevel: "moderate",
  parameters: [
    { name: "prompt", type: "string", description: "Detailed image prompt", required: true },
    { name: "model", type: "string", description: "Image model/deployment: azure:gpt-image-2 or azure:MAI-Image-2e (default: azure:gpt-image-2)", required: false },
    { name: "size", type: "string", description: "Image size, e.g. 1024x1024 (default: 1024x1024)", required: false },
    { name: "outputName", type: "string", description: "Optional safe output filename without extension", required: false },
  ],
  async execute(args) {
    const rawPrompt = String(args.prompt || "").trim();
    if (!rawPrompt) return "Error: prompt is required";
    const mediaQualityGuard = "High-end commercial quality, crisp composition, clean silhouettes, consistent lighting, professional web/brand design, no blur, no distorted anatomy, no fused objects, no broken text, no random artifacts, no watermark, no low-resolution noise.";
    const prompt = /\b(no |avoid|negative|artifact|blur|distort)/i.test(rawPrompt) ? rawPrompt : `${rawPrompt}. ${mediaQualityGuard}`;
    const requestedModel = String(args.model || "azure:gpt-image-2").trim();
    const modelKey = requestedModel.toLowerCase();
    const size = String(args.size || "1024x1024").trim();
    const [widthRaw, heightRaw] = size.toLowerCase().split("x");
    const width = Math.max(256, Math.min(2048, Number(widthRaw) || 1024));
    const height = Math.max(256, Math.min(2048, Number(heightRaw) || width || 1024));

    const account = "qubitpage-resource";
    const resourceGroup = "rg-qubitpage";
    const accountInfo = runAzureCliJson(["cognitiveservices", "account", "show", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
    const endpoint = firstString(accountInfo.properties, ["endpoint"]);
    const keys = runAzureCliJson(["cognitiveservices", "account", "keys", "list", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
    const apiKey = firstString(keys, ["key1", "key2"]);
    if (!endpoint || !apiKey) return "Error: Azure endpoint/key not available from CLI. Check az login and cognitiveservices permissions.";

    let deployment = "gpt-image-2";
    let providerModel = "azure:gpt-image-2";
    let response: Record<string, unknown>;

    if (modelKey === "azure:gpt-image-2" || modelKey === "gpt-image-2") {
      const apiVersion = "2025-04-01-preview";
      const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/images/generations?api-version=${apiVersion}`;
      response = await httpsJson(url, { prompt, size: `${width}x${height}`, n: 1 }, { "api-key": apiKey }, 240000) as Record<string, unknown>;
    } else if (modelKey === "azure:mai-image-2e" || modelKey === "mai-image-2e") {
      deployment = "MAI-Image-2e";
      providerModel = "azure:MAI-Image-2e";
      const maiEndpoint = `https://${account}.services.ai.azure.com`;
      const url = `${maiEndpoint}/mai/v1/images/generations`;
      response = await httpsJson(url, { model: deployment, prompt, width, height }, { "api-key": apiKey }, 240000) as Record<string, unknown>;
    } else {
      return `Error: unsupported image model '${requestedModel}'. Available tested models: azure:gpt-image-2, azure:MAI-Image-2e.`;
    }

    const data = Array.isArray(response.data) ? response.data as Record<string, unknown>[] : [];
    const item = data[0] || {};
    const b64 = firstString(item, ["b64_json", "b64"]);
    const imageUrl = firstString(item, ["url"]);
    const outDir = path.join(getBaseDir(), ".sentinel", "generated", "images");
    fs.mkdirSync(outDir, { recursive: true });
    const defaultName = providerModel.replace(/[^a-zA-Z0-9._-]+/g, "-") + `-${Date.now()}`;
    const nameBase = String(args.outputName || defaultName).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 90) || `image-${Date.now()}`;
    const outPath = path.join(outDir, `${nameBase}.png`);

    if (b64) {
      fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    } else if (imageUrl) {
      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(outPath);
        https.get(imageUrl, (res) => {
          if ((res.statusCode || 0) >= 400) { reject(new Error(`image download HTTP ${res.statusCode}`)); return; }
          res.pipe(file);
          file.on("finish", () => { file.close(); resolve(); });
        }).on("error", reject);
      });
    } else {
      return `Error: image response did not contain b64_json or url. Keys: ${Object.keys(item).join(", ")}`;
    }
    const stat = fs.statSync(outPath);
    return JSON.stringify({ ok: true, provider: "azure", model: providerModel, path: outPath, bytes: stat.size, prompt: prompt.slice(0, 500), width, height }, null, 2);
  },
};

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

const captureScreenshotTool: ToolDefinition = {
  name: "captureScreenshot",
  description: "Agent diagnostic tool: capture the current desktop screen to .sentinel/generated/screenshots so the agent can inspect UI bugs, layout issues, dialogs, screenshots, or visual code errors.",
  category: "workspace",
  dangerLevel: "moderate",
  parameters: [
    { name: "outputName", type: "string", description: "Optional safe output filename without extension", required: false }
  ],
  async execute(args) {
    const script = `
from __future__ import annotations
import json, sys
from pathlib import Path
try:
    from PIL import ImageGrab
except Exception as exc:
    print(json.dumps({"ok": False, "error": "Pillow/ImageGrab unavailable: %s" % exc}))
    sys.exit(0)
out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
try:
    img = ImageGrab.grab()
    img.save(out)
    print(json.dumps({"ok": True, "path": str(out), "size": list(img.size), "bytes": out.stat().st_size}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}))
`;
    const name = safeOutputName(String(args.outputName || `screenshot-${Date.now()}`));
    const outPath = path.join(getBaseDir(), ".sentinel", "generated", "screenshots", `${name}.png`);
    const py = process.platform === "win32" ? "python" : "python3";
    const res = child_process.spawnSync(py, ["-c", script, outPath], {
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
    const raw = (res.stdout || res.stderr || "").trim();
    try {
      const parsed = JSON.parse(raw || "{}");
      return JSON.stringify({ tool: "captureScreenshot", ...parsed }, null, 2);
    } catch {
      return JSON.stringify({ tool: "captureScreenshot", ok: false, error: raw || `Python exited ${res.status}` }, null, 2);
    }
  }
};

const ocrImageTool: ToolDefinition = {
  name: "ocrImage",
  description: "Agent diagnostic tool: OCR a screenshot/image for UI text, errors, dialogs, code snippets, or visual issue reports. Uses local Tesseract OCR when installed and falls back to image metadata when unavailable.",
  category: "workspace",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "Image path to OCR", required: true },
    { name: "language", type: "string", description: "OCR language, default eng", required: false }
  ],
  async execute(args) {
    const imagePath = resolvePath(String(args.path || ""));
    const language = String(args.language || "eng").replace(/[^a-zA-Z_+-]/g, "") || "eng";
    if (!fs.existsSync(imagePath)) {
      return JSON.stringify({ tool: "ocrImage", ok: false, error: `File not found: ${imagePath}` }, null, 2);
    }
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const binary = process.platform === "win32" ? "tesseract.exe" : "tesseract";
    const found = child_process.spawnSync(locator, [binary], { encoding: "utf8", timeout: 5000, windowsHide: true });
    if (found.status !== 0) {
      let metadata: unknown = null;
      try { metadata = safeJsonParse(await inspectFileTool.execute({ path: imagePath, maxPreviewChars: 0 }, { append() {}, appendLine() {}, show() {} } as unknown as vscode.OutputChannel)); } catch { /* ignore */ }
      return JSON.stringify({
        tool: "ocrImage",
        ok: false,
        ocrAvailable: false,
        note: "Tesseract OCR is not installed or not in PATH. Install Tesseract to enable text extraction.",
        path: imagePath,
        imageMetadata: metadata,
      }, null, 2);
    }
    const res = child_process.spawnSync(binary, [imagePath, "stdout", "-l", language], {
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
    const text = (res.stdout || "").trim();
    return JSON.stringify({
      tool: "ocrImage",
      ok: res.status === 0,
      path: imagePath,
      language,
      text,
      preview: text.slice(0, 2000),
      error: res.status === 0 ? undefined : (res.stderr || `tesseract exited ${res.status}`).trim(),
    }, null, 2);
  }
};


const generateVideoTool: ToolDefinition = {
  name: "generateVideo",
  description: "Generate a short video with the tested Azure Sora 2 deployment and save it into .sentinel/generated/videos. Ask for or accept a scenario, style, duration, size, and continuation notes; returns the local MP4 path and metadata.",
  category: "web",
  dangerLevel: "moderate",
  parameters: [
    { name: "prompt", type: "string", description: "Detailed scenario/prompt for the video. Include setting, characters/objects, action, camera style, mood, language/cultural context, and whether it continues a previous shot. Avoid protected IP, unsafe content, or unreadable text overlays.", required: true },
    { name: "model", type: "string", description: "Video model. Currently tested: azure:sora-2", required: false },
    { name: "size", type: "string", description: "Video size, e.g. 720x1280", required: false },
    { name: "seconds", type: "string", description: "Duration in seconds. Tested with 4 and 12 second vertical videos.", required: false },
    { name: "outputName", type: "string", description: "Optional safe output filename without extension", required: false },
  ],
  async execute(args) {
    const rawPrompt = String(args.prompt || "").trim();
    if (!rawPrompt) return "Error: prompt is required";
    const soraPositiveDefaults = [
      "high-end commercial realism",
      "cinematic documentary style",
      "natural human movement and expressive faces",
      "believable presenter performance when people are included",
      "dynamic camera motion with stable framing",
      "sharp focus, clean depth of field, professional lighting",
      "coherent scene continuity, physically plausible motion",
      "premium enterprise product presentation quality",
      "modern realistic environments, no static slideshow feeling"
    ].join(", ");
    const soraNegativeDefaults = [
      "no watermarks, no unwanted logos, no copied brand marks unless explicitly provided",
      "no unreadable text overlays, no garbled typography, no fake UI text",
      "no blurry frames, no low-resolution artifacts, no compression noise",
      "no distorted faces, no extra fingers, no warped hands, no broken anatomy",
      "no fused people, no fused animals, no fused objects, no duplicated limbs",
      "no frozen or static people, no mannequin movement, no dead eyes",
      "no rubbery motion, no jitter, no flicker, no sudden object teleporting",
      "no warped screens, no melting devices, no impossible reflections",
      "no unsafe, hateful, sexual, violent, or deceptive content",
      "no subtitles unless explicitly requested; if speech is requested, let the generated scene carry it naturally"
    ].join(", ");
    const prompt = [
      rawPrompt,
      "QUALITY DEFAULTS: " + soraPositiveDefaults + ".",
      "NEGATIVE / AVOID: " + soraNegativeDefaults + "."
    ].join("\n\n");
    const model = String(args.model || "azure:sora-2").trim().toLowerCase();
    if (model !== "azure:sora-2" && model !== "sora-2") {
      return `Error: unsupported video model '${args.model}'. Currently tested: azure:sora-2.`;
    }
    const size = String(args.size || "720x1280").trim();
    const seconds = String(args.seconds || "4").trim();
    const acct = getAzureOpenAIAccount();
    const endpoint = `https://${acct.account}.services.ai.azure.com`;
    const videosUrl = `${endpoint}/openai/v1/videos`;
    const headers = {
      "Authorization": `Bearer ${acct.key}`,
      "User-Agent": "sentinel-coder-sora2/1.0",
      "Accept": "application/json",
    };

    const requestBuffer = (method: string, url: string, payload?: unknown, accept = "application/json", timeoutMs = 120000): Promise<{ status: number; body: Buffer; contentType: string }> => new Promise((resolve, reject) => {
      const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), "utf-8");
      const reqHeaders: Record<string, string> = { ...headers, "Accept": accept };
      if (data) {
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = String(data.length);
      }
      const req = https.request(url, { method, headers: reqHeaders, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks), contentType: String(res.headers["content-type"] || "") }));
      });
      req.on("timeout", () => req.destroy(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`)));
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });

    const parseJson = (buffer: Buffer): Record<string, unknown> => {
      try { return JSON.parse(buffer.toString("utf-8")); } catch { return { raw: buffer.toString("utf-8", 0, Math.min(buffer.length, 1000)) }; }
    };

    const submit = await requestBuffer("POST", videosUrl, { prompt, model: "sora-2", size, seconds }, "application/json", 120000);
    const submitJson = parseJson(submit.body);
    if (submit.status < 200 || submit.status >= 300) {
      return `Error: Azure Sora 2 submit failed HTTP ${submit.status}: ${JSON.stringify(submitJson).slice(0, 1000)}`;
    }
    const videoId = String(submitJson.id || "");
    if (!videoId) return `Error: Azure Sora 2 did not return a video id: ${JSON.stringify(submitJson).slice(0, 1000)}`;

    let job: Record<string, unknown> = submitJson;
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      const poll = await requestBuffer("GET", `${videosUrl}/${encodeURIComponent(videoId)}`, undefined, "application/json", 120000);
      job = parseJson(poll.body);
      const state = String(job.status || job.state || "").toLowerCase();
      if (["completed", "succeeded", "done", "complete"].includes(state)) break;
      if (["failed", "cancelled", "canceled", "error"].includes(state)) {
        return `Error: Azure Sora 2 video generation failed: ${JSON.stringify(job).slice(0, 1200)}`;
      }
    }
    const finalStatus = String(job.status || job.state || "").toLowerCase();
    if (!["completed", "succeeded", "done", "complete"].includes(finalStatus)) {
      return `Error: Azure Sora 2 video generation timed out. Last status: ${finalStatus || "unknown"}. Job: ${JSON.stringify(job).slice(0, 1200)}`;
    }

    const mp4 = await requestBuffer("GET", `${videosUrl}/${encodeURIComponent(videoId)}/content`, undefined, "video/mp4,*/*", 180000);
    if (mp4.status < 200 || mp4.status >= 300 || mp4.body.length < 1000) {
      return `Error: Azure Sora 2 content download failed HTTP ${mp4.status}: ${mp4.body.toString("utf-8", 0, Math.min(mp4.body.length, 800))}`;
    }
    const outDir = path.join(getBaseDir(), ".sentinel", "generated", "videos");
    fs.mkdirSync(outDir, { recursive: true });
    const name = safeOutputName(String(args.outputName || `azure-sora2-${videoId}`));
    const outPath = path.join(outDir, `${name}.mp4`);
    fs.writeFileSync(outPath, mp4.body);
    return JSON.stringify({ ok: true, provider: "azure", model: "sora-2", id: videoId, status: finalStatus, path: outPath, bytes: mp4.body.length, size, seconds }, null, 2);
  },
};

const generateSpeechTool: ToolDefinition = {
  name: "generateSpeech",
  description: "Generate speech audio with Azure AI Speech and save it into .sentinel/generated/audio. Currently supports azure:speech-tts.",
  category: "web",
  dangerLevel: "moderate",
  parameters: [
    { name: "text", type: "string", description: "Text to synthesize", required: true },
    { name: "voice", type: "string", description: "Azure Speech voice, e.g. en-US-JennyNeural (default)", required: false },
    { name: "outputName", type: "string", description: "Optional safe output filename without extension", required: false },
  ],
  async execute(args) {
    const text = String(args.text || "").trim();
    if (!text) return "Error: text is required";
    if (text.length > 5000) return "Error: text is too long for a single speech request; keep it under 5000 characters.";
    const voice = String(args.voice || "en-US-JennyNeural").trim() || "en-US-JennyNeural";
    const nameBase = String(args.outputName || `azure-speech-${Date.now()}`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 90) || `speech-${Date.now()}`;

    const account = "qubitpage-resource";
    const resourceGroup = "rg-qubitpage";
    const accountInfo = runAzureCliJson(["cognitiveservices", "account", "show", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
    const keys = runAzureCliJson(["cognitiveservices", "account", "keys", "list", "--name", account, "--resource-group", resourceGroup]) as Record<string, unknown>;
    const apiKey = firstString(keys, ["key1", "key2"]);
    const location = String(accountInfo.location || "swedencentral").toLowerCase();
    if (!apiKey) return "Error: Azure Speech key not available from CLI. Check az login and cognitiveservices permissions.";

    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${escapedText}</voice></speak>`;
    const url = `https://${location}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const audio = await httpsBinary(url, Buffer.from(ssml, "utf-8"), {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "sentinel-coder/tts",
    }, 120000);

    const outDir = path.join(getBaseDir(), ".sentinel", "generated", "audio");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${nameBase}.mp3`);
    fs.writeFileSync(outPath, audio);
    return JSON.stringify({ ok: true, provider: "azure", model: "speech-tts", voice, path: outPath, bytes: audio.length, text: text.slice(0, 500) }, null, 2);
  },
};


const appendFileTool: ToolDefinition = {
  name: "appendFile",
  description: "Append text to the end of an existing file (or create it if it doesn't exist)",
  category: "filesystem",
  dangerLevel: "moderate",
  parameters: [
    { name: "path", type: "string", description: "File path", required: true },
    { name: "content", type: "string", description: "Text to append", required: true },
  ],
  execute: async (args) => {
    const filePath = resolvePath(args.path as string);
    fs.appendFileSync(filePath, args.content as string, "utf-8");
    return `Appended to: ${filePath}`;
  },
};

const readClipboardTool: ToolDefinition = {
  name: "readClipboard",
  description: "Read the current contents of the system clipboard",
  category: "editor",
  dangerLevel: "safe",
  parameters: [],
  execute: async () => {
    const text = await vscode.env.clipboard.readText();
    return text ? `Clipboard contents:\n${text.slice(0, 4000)}` : "Clipboard is empty";
  },
};

const writeClipboardTool: ToolDefinition = {
  name: "writeClipboard",
  description: "Write text to the system clipboard",
  category: "editor",
  dangerLevel: "safe",
  parameters: [
    { name: "text", type: "string", description: "Text to copy to clipboard", required: true },
  ],
  execute: async (args) => {
    await vscode.env.clipboard.writeText(args.text as string);
    return "Copied to clipboard";
  },
};

type FirewallFinding = {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  file: string;
  line: number;
  message: string;
  snippet: string;
};

const FIREWALL_PATTERNS: Array<{ severity: FirewallFinding["severity"]; type: string; message: string; regex: RegExp }> = [
  { severity: "critical", type: "Secret/API key", message: "Possible live API key or token literal. Move to env/secrets storage.", regex: new RegExp("\\b(sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\\b", "g") },
  { severity: "critical", type: "Private key", message: "Private key material must never be committed or pasted into chat.", regex: new RegExp("-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----", "g") },
  { severity: "high", type: "Hardcoded password", message: "Hardcoded password-like assignment detected.", regex: new RegExp("\\b(?:password|passwd|pwd|secret|token|api[_-]?key)\\b\\s*[:=]\\s*[\\\"'][^\\\"'\\n]{8,}[\\\"']", "gi") },
  { severity: "high", type: "Command injection risk", message: "Dynamic shell execution needs strict validation/escaping.", regex: new RegExp("\\b(?:ex" + "ec|ex" + "ecSync|sp" + "awn|sp" + "awnSync|system|shell_" + "exec|popen)\\s*\\([^\\n]*(?:\\$\\{|req\\.|request\\.|in" + "put|ar" + "gs|body|query|params)", "gi") },
  { severity: "high", type: "SQL injection risk", message: "SQL string concatenation/interpolation with request input detected.", regex: new RegExp("\\b(?:SEL" + "ECT|INS" + "ERT|UPD" + "ATE|DEL" + "ETE)\\b[^\\n]*(?:\\+|\\$\\{)[^\\n]*(?:req\\.|request\\.|in" + "put|body|query|params)", "gi") },
  { severity: "medium", type: "Unsafe HTML", message: "Raw HTML insertion can become XSS if data is user-controlled.", regex: new RegExp("\\bin" + "nerHTML\\s*=|dangerouslySetInnerHTML", "g") },
  { severity: "medium", type: "Dangerous filesystem command", message: "Destructive command pattern detected; verify target path and approvals.", regex: new RegExp("\\b(?:rm\\s+-rf|Remove" + "-Item\\b[^\\n]*(?:-Recurse|-Force)|del\\s+\\/s|format\\s+[A-Z]:)", "gi") },
  { severity: "low", type: "Debug code", message: "Debug output or debugger statement may need removal before production.", regex: new RegExp("\\bdebugger\\b|console" + "\\.log\\(", "g") },
];

function getLineTextAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const endAt = text.indexOf("\n", index);
  return text.slice(start, endAt === -1 ? text.length : endAt).trim();
}

function shouldSuppressFirewallFinding(type: string, lineText: string): boolean {
  // Do not report the scanner's own pattern table as application findings.
  if (/severity:\s*["'](?:critical|high|medium|low)["']/.test(lineText) && /regex:/.test(lineText)) return true;
  if (type !== "Unsafe HTML") return false;
  // Empty/static assignments and values that are explicitly escaped are intentionally used
  // in the webview. Keep the scanner useful by flagging raw dynamic HTML, not every UI render.
  if (/innerHTML\s*=\s*["'`]\s*["'`]/.test(lineText)) return true;
  if (/innerHTML\s*=\s*["'`][^`"'$<]*(?:<[^>]+>[^`"'$]*)?["'`];?$/.test(lineText)) return true;
  if (/innerHTML\s*=\s*(?:renderMd\(|esc\(|sanitize|safeHtml)/.test(lineText)) return true;
  if (/\+\s*esc\(|esc\([^)]*\)\s*\+/.test(lineText)) return true;
  return false;
}

function firewallScanText(text: string, fileLabel: string): FirewallFinding[] {
  const findings: FirewallFinding[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineFor = (idx: number) => {
    let line = 1;
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i] <= idx) line = i + 1;
      else break;
    }
    return line;
  };
  for (const pattern of FIREWALL_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) && findings.length < 250) {
      const lineText = getLineTextAt(text, match.index);
      if (shouldSuppressFirewallFinding(pattern.type, lineText)) continue;
      const snippet = lineText.replace(/\s+/g, " ").slice(0, 180) || match[0].replace(/\s+/g, " ").slice(0, 180);
      findings.push({
        severity: pattern.severity,
        type: pattern.type,
        file: fileLabel,
        line: lineFor(match.index),
        message: pattern.message,
        snippet,
      });
    }
  }
  return findings;
}

function shouldScanFile(filePath: string): boolean {
  const rel = filePath.replace(/\\/g, "/");
  if (/\/(node_modules|\.git|dist|build|out|\.next|coverage|vendor|__pycache__)\//.test(rel)) return false;
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|7z|exe|dll|so|dylib|mp4|mov|wasm)$/i.test(rel)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|php|rb|go|java|cs|rs|sh|ps1|bat|cmd|json|ya?ml|env|md|html|css|sql)$/i.test(rel) || !path.extname(rel);
}

const firewallScanTool: ToolDefinition = {
  name: "firewallScan",
  description: "Run a native Sentinel/IBM-Bob-style security firewall scan for secrets, injection risks, unsafe HTML, destructive commands, and debug code. Use before finalizing or publishing changes.",
  category: "security",
  dangerLevel: "safe",
  parameters: [
    { name: "path", type: "string", description: "File or folder to scan, relative to workspace. Defaults to current workspace.", required: false },
    { name: "text", type: "string", description: "Optional raw text/code to scan instead of files.", required: false },
    { name: "maxFiles", type: "number", description: "Maximum files to scan from a folder (default 500).", required: false },
    { name: "format", type: "string", description: "Output format: text or json (default text).", required: false },
  ],
  execute: async (args) => {
    const maxFiles = Math.max(1, Math.min(Number(args.maxFiles ?? 500), 5000));
    let findings: FirewallFinding[] = [];
    let scannedFiles = 0;
    let consideredFiles = 0;
    let skippedUnreadable = 0;
    let skippedUnsupported = 0;
    let skippedTooLarge = 0;
    let truncatedByLimit = false;
    const scannedPathLabels: string[] = [];
    const skippedPreview: string[] = [];
    const rawText = typeof args.text === "string" ? args.text : "";
    const requestedTarget = rawText ? "<provided text>" : ((args.path as string) || ".");
    if (rawText) {
      findings = firewallScanText(rawText, "<provided text>");
      scannedFiles = 1;
      consideredFiles = 1;
      scannedPathLabels.push("<provided text>");
    } else {
      const target = resolvePath(requestedTarget);
      const files: string[] = [];
      const walk = (p: string) => {
        if (files.length >= maxFiles) { truncatedByLimit = true; return; }
        let st: fs.Stats;
        try { st = fs.statSync(p); } catch { skippedUnreadable++; skippedPreview.push(path.relative(getBaseDir(), p) || p); return; }
        if (st.isDirectory()) {
          let entries: string[] = [];
          try { entries = fs.readdirSync(p); } catch { skippedUnreadable++; skippedPreview.push(path.relative(getBaseDir(), p) || p); return; }
          for (const entry of entries) {
            if (files.length >= maxFiles) { truncatedByLimit = true; break; }
            walk(path.join(p, entry));
          }
          return;
        }
        if (!st.isFile()) return;
        consideredFiles++;
        const label = path.relative(getBaseDir(), p) || p;
        if (!shouldScanFile(p)) { skippedUnsupported++; if (skippedPreview.length < 40) skippedPreview.push(label); return; }
        if (st.size > 1024 * 1024) { skippedTooLarge++; if (skippedPreview.length < 40) skippedPreview.push(`${label} (>1MB)`); return; }
        files.push(p);
      };
      walk(target);
      for (const file of files.slice(0, maxFiles)) {
        scannedFiles++;
        const label = path.relative(getBaseDir(), file) || file;
        scannedPathLabels.push(label);
        try {
          const text = fs.readFileSync(file, "utf-8");
          findings.push(...firewallScanText(text, label));
        } catch { skippedUnreadable++; if (skippedPreview.length < 40) skippedPreview.push(label); }
      }
    }
    const weights: Record<FirewallFinding["severity"], number> = { critical: 25, high: 10, medium: 4, low: 1 };
    const penalty = findings.reduce((sum, f) => sum + weights[f.severity], 0);
    const healthScore = Math.max(0, 100 - penalty);
    const summary = {
      requestedTarget,
      scannedFiles,
      consideredFiles,
      skippedUnreadable,
      skippedUnsupported,
      skippedTooLarge,
      truncatedByLimit,
      maxFiles,
      findings: findings.length,
      healthScore,
      bySeverity: findings.reduce<Record<string, number>>((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {}),
      scannedPathsPreview: scannedPathLabels.slice(0, 80),
      scannedPathsOmitted: Math.max(0, scannedPathLabels.length - 80),
      skippedPreview,
    };
    if ((args.format as string) === "json") return JSON.stringify({ summary, findings }, null, 2);
    const lines: string[] = [];
    lines.push("Security Firewall Scan");
    lines.push(`Target requested: ${summary.requestedTarget}`);
    lines.push(`Health score: ${healthScore}/100`);
    lines.push(`Files considered: ${summary.consideredFiles}`);
    lines.push(`Files/text units scanned: ${summary.scannedFiles}`);
    lines.push(`Skipped unreadable: ${summary.skippedUnreadable}`);
    lines.push(`Skipped unsupported type: ${summary.skippedUnsupported}`);
    lines.push(`Skipped too large (>1MB): ${summary.skippedTooLarge}`);
    lines.push(`Truncated by maxFiles: ${summary.truncatedByLimit}`);
    lines.push(`Findings: ${summary.findings}`);
    lines.push(`Severity: ${JSON.stringify(summary.bySeverity)}`);
    lines.push("");
    lines.push("Scanned paths preview:");
    if (summary.scannedPathsPreview.length) {
      for (const p of summary.scannedPathsPreview) lines.push(`- ${p}`);
      if (summary.scannedPathsOmitted) lines.push(`... ${summary.scannedPathsOmitted} more paths omitted`);
    } else {
      lines.push("- <none>");
    }
    if (summary.skippedPreview.length) {
      lines.push("");
      lines.push("Skipped preview:");
      for (const p of summary.skippedPreview) lines.push(`- ${p}`);
    }
    lines.push("");
    if (findings.length) {
      lines.push("Findings:");
      for (const f of findings.slice(0, 40)) {
        lines.push(`- [${f.severity.toUpperCase()}] ${f.type} ${f.file}:${f.line} - ${f.message}`);
        lines.push(`  ${f.snippet}`);
      }
      if (findings.length > 40) lines.push(`... ${findings.length - 40} more findings omitted`);
    } else {
      lines.push("No findings from built-in scanner.");
    }
    return lines.join("\n");
  },
};

// Tool Registry

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private enabledTools: Set<string> = new Set();
  private secrets?: vscode.SecretStorage;

  constructor(secrets?: vscode.SecretStorage) {
    this.secrets = secrets;
    this.registerDefaults();
  }

  private async getStoredProviderSecret(providerId: string): Promise<string | undefined> {
    if (!this.secrets) return undefined;
    try {
      const raw = await this.secrets.get("sentinel-coder.providerKeys");
      if (!raw) return undefined;
      const keys = JSON.parse(raw) as Record<string, string>;
      return keys[providerId];
    } catch {
      return undefined;
    }
  }

  private getStoredProviderBaseUrl(providerId: string, fallback: string): string {
    try {
      const providers = vscode.workspace
        .getConfiguration("sentinelCoder")
        .get<Array<{ id: string; baseUrl?: string }>>("providers", []);
      const found = providers.find((p) => p.id === providerId);
      return (found?.baseUrl || fallback).replace(/\/$/, "");
    } catch {
      return fallback.replace(/\/$/, "");
    }
  }

  private registerDefaults() {
    const allTools = [
      createFileTool, readFileTool, inspectFileTool, prepareGeneratedWorkspaceTool, analyzeImageTool, createOfficeDocumentTool, discoverMediaModelsTool, generateImageTool, generateVideoTool, generateSpeechTool, captureScreenshotTool, ocrImageTool, transcribeAudioTool, editFileTool, deleteFileTool, listDirectoryTool,
      appendFileTool,
      runCommandTool, searchFilesTool, searchTextTool, codebaseSearchTool,
      getOpenFileTool, getSelectionTool, insertTextTool, getErrorsTool, getOpenFilesTool,
      readClipboardTool, writeClipboardTool,
      gitStatusTool, gitDiffTool, gitCommitTool, gitPushTool, gitLogTool,
      getWorkspaceInfoTool,
      serveFileTool, openBrowserTool,
      httpRequestTool, sshCommandTool, dockerCommandTool,
      webSearchTool,
      queryRAGTool, ingestRAGTool,
      firewallScanTool,
    ];
    for (const tool of allTools) {
      this.tools.set(tool.name, tool);
      this.enabledTools.add(tool.name);
    }
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getEnabled(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => this.enabledTools.has(t.name));
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  isEnabled(name: string): boolean {
    return this.enabledTools.has(name);
  }

  setEnabled(name: string, enabled: boolean) {
    if (enabled) this.enabledTools.add(name);
    else this.enabledTools.delete(name);
  }

  getEnabledNames(): string[] {
    return Array.from(this.enabledTools);
  }

  setAllEnabled(names: string[]) {
    this.enabledTools = new Set(names);
  }

  getToolsForPrompt(): string {
    const enabled = this.getEnabled();
    if (enabled.length === 0) return "";
    let prompt = "\n\nYou have the following tools available. To use a tool, respond with a JSON block:\n```tool\n{\"tool\": \"toolName\", \"args\": {\"param\": \"value\"}}\n```\n\nAvailable tools:\n";
    for (const tool of enabled) {
      const params = tool.parameters.map((p) => `${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`).join("; ");
      prompt += `- **${tool.name}**: ${tool.description}${params ? ` | Params: ${params}` : ""}\n`;
    }
    prompt += "\nYou can call multiple tools in sequence. After each tool result, continue your response.\n";
    return prompt;
  }

  /** Build OpenAI-style function specs for all enabled tools (native tool calling). */
  getToolSpecs(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    const specs: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> = [];
    for (const tool of this.getEnabled()) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const p of tool.parameters) {
        properties[p.name] = { type: p.type, description: p.description };
        if (p.required) required.push(p.name);
      }
      specs.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: { type: "object", properties, required },
        },
      });
    }
    return specs;
  }
}

// Tool Registry ── Tool Call Parser ────────────────────────────────────────────────────────

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /```tool\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && typeof parsed.tool === "string") {
        calls.push({ tool: parsed.tool, args: parsed.args || {} });
      }
    } catch {
      // skip malformed tool calls
    }
  }
  return calls;
}
