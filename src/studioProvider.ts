import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface StudioFileItem {
  id: string;
  name: string;
  path: string;
  workspaceRelativePath: string;
  kind: "image" | "video" | "audio" | "document" | "text" | "data" | "pdf" | "office" | "other";
  category: string;
  size: number;
  modified: number;
  webviewUri?: string;
  editable: boolean;
  preview?: string;
}

const GENERATED_ROOT = ".sentinel/generated";
const MAX_TEXT_PREVIEW_BYTES = 200_000;
const MAX_LIST_ITEMS_PER_CATEGORY = 250;

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeId(filePath: string): string {
  return Buffer.from(filePath, "utf8").toString("base64url");
}

function normalizeFsPath(input: string): string {
  return input.replace(/^file:\/\//i, "");
}

function sanitizeFileName(input: string, fallback: string): string {
  const cleaned = input.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120);
  return cleaned || fallback;
}

function ensureInsideWorkspace(targetPath: string, workspaceRoot: string): string {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Studio file operations are limited to the current workspace for safety.");
  }
  return resolved;
}

function fileKind(filePath: string): StudioFileItem["kind"] {
  const ext = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"].includes(ext)) {
    return "image";
  }
  if ([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"].includes(ext)) {
    return "video";
  }
  if ([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"].includes(ext)) {
    return "audio";
  }
  if (ext === ".pdf") {
    return "pdf";
  }
  if ([".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".odt", ".ods", ".odp"].includes(ext)) {
    return "office";
  }
  if ([".md", ".txt", ".json", ".yaml", ".yml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".php", ".py", ".csv", ".sql", ".xml", ".svg"].includes(ext)) {
    return ext === ".csv" || ext === ".json" || ext === ".sql" || ext === ".xml" ? "data" : "text";
  }
  return "other";
}

function isEditableKind(kind: StudioFileItem["kind"], filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ["text", "data"].includes(kind) || [".md", ".txt", ".csv", ".json", ".yaml", ".yml", ".html", ".css", ".js", ".ts", ".tsx", ".jsx", ".php", ".py", ".sql", ".xml", ".svg"].includes(ext);
}

function categoryFor(filePath: string, workspaceRoot: string): string {
  const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
  if (rel.startsWith(`${GENERATED_ROOT}/images/`)) {
    return "Generated Images";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/videos/`)) {
    return "Generated Videos";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/audio/`)) {
    return "Generated Audio";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/documents/`)) {
    return "Generated Documents";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/presentations/`)) {
    return "Generated Presentations";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/data/`)) {
    return "Generated Data";
  }
  if (rel.startsWith(`${GENERATED_ROOT}/reports/`)) {
    return "Generated Reports";
  }
  const kind = fileKind(filePath);
  if (kind === "image") {
    return "Workspace Images";
  }
  if (kind === "video") {
    return "Workspace Videos";
  }
  if (kind === "audio") {
    return "Workspace Audio";
  }
  if (kind === "office" || kind === "pdf") {
    return "Workspace Documents";
  }
  if (kind === "text" || kind === "data") {
    return "Workspace Text/Data";
  }
  return "Other Workspace Files";
}

function shouldSkipDirectory(name: string): boolean {
  return [".git", "node_modules", ".next", "dist", "build", "out", ".venv", "venv", "__pycache__", ".turbo", ".cache"].includes(name);
}

function canPreviewAsText(filePath: string): boolean {
  return [".md", ".txt", ".csv", ".json", ".yaml", ".yml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".php", ".py", ".sql", ".xml", ".svg"].includes(path.extname(filePath).toLowerCase());
}

function readTextPreview(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_TEXT_PREVIEW_BYTES || !canPreviewAsText(filePath)) {
      return undefined;
    }
    const text = fs.readFileSync(filePath, "utf8");
    return text.slice(0, MAX_TEXT_PREVIEW_BYTES);
  } catch {
    return undefined;
  }
}

async function walkFiles(root: string, maxDepth: number, predicate: (filePath: string) => boolean): Promise<string[]> {
  const results: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length && results.length < 2000) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth && !shouldSkipDirectory(entry.name)) {
          stack.push({ dir: full, depth: current.depth + 1 });
        }
      } else if (entry.isFile() && predicate(full)) {
        results.push(full);
        if (results.length >= 2000) {
          break;
        }
      }
    }
  }
  return results;
}

export class SentinelStudioProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sentinel-coder.studioView";
  private _view?: vscode.WebviewView;
  private _items = new Map<string, StudioFileItem>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly enqueueChatRequest?: (message: string) => void
  ) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this._view = webviewView;
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [];
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, ...workspaceRoots],
    };
    webviewView.webview.html = this._html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        await this._handleMessage(message);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`[Studio] ${text}`);
        this._post({ type: "error", message: text });
      }
    });
    await this.refresh();
  }

  public openFilePath(filePath: string): void {
    const normalized = path.resolve(normalizeFsPath(filePath));
    const match = Array.from(this._items.values()).find((item) => path.resolve(item.path).toLowerCase() === normalized.toLowerCase());
    if (match) {
      this._post({ type: "select", id: match.id });
      return;
    }
    if (fs.existsSync(normalized) && this._view) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(normalized);
      const stat = fs.statSync(normalized);
      const kind = fileKind(normalized);
      const item: StudioFileItem = {
        id: safeId(normalized),
        name: path.basename(normalized),
        path: normalized,
        workspaceRelativePath: workspaceRoot ? path.relative(workspaceRoot, normalized) : normalized,
        kind,
        category: categoryFor(normalized, workspaceRoot),
        size: stat.size,
        modified: stat.mtimeMs,
        webviewUri: this._view.webview.asWebviewUri(vscode.Uri.file(normalized)).toString(),
        editable: isEditableKind(kind, normalized),
        preview: readTextPreview(normalized),
      };
      this._items.set(item.id, item);
      this._post({ type: "items", items: Array.from(this._items.values()) });
      this._post({ type: "select", id: item.id });
    }
  }

  public async refresh(): Promise<void> {
    if (!this._view) {
      return;
    }
    const items = await this._collectItems(this._view.webview);
    this._items = new Map(items.map((item) => [item.id, item]));
    this._post({ type: "items", items });
  }

  private async _handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready" || message.type === "refresh") {
      await this.refresh();
      return;
    }
    if (message.type === "open") {
      const item = this._items.get(String(message.id));
      if (item) {
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(item.path));
      }
      return;
    }
    if (message.type === "reveal") {
      const item = this._items.get(String(message.id));
      if (item) {
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.path));
      }
      return;
    }
    if (message.type === "save") {
      await this._saveTextFile(String(message.id), String(message.content ?? ""));
      return;
    }
    if (message.type === "createFile") {
      await this._createManagedFile(String(message.kind ?? "markdown"));
      return;
    }
    if (message.type === "renameFile") {
      await this._renameManagedFile(String(message.id));
      return;
    }
    if (message.type === "duplicateFile") {
      await this._duplicateManagedFile(String(message.id));
      return;
    }
    if (message.type === "deleteFile") {
      await this._deleteManagedFile(String(message.id));
      return;
    }
    if (message.type === "listVersions") {
      await this._listVersions(String(message.id));
      return;
    }
    if (message.type === "restoreVersion") {
      await this._restoreVersion(String(message.id), String(message.versionPath ?? ""));
      return;
    }
    if (message.type === "addComment") {
      await this._addComment(String(message.id), String(message.comment ?? ""), String(message.selection ?? ""));
      return;
    }
    if (message.type === "openGeneratedFolder") {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error("Open a workspace folder first.");
      }
      const generatedRoot = path.join(folder.uri.fsPath, GENERATED_ROOT);
      await fs.promises.mkdir(generatedRoot, { recursive: true });
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(generatedRoot));
      return;
    }
    if (message.type === "createTemplate") {
      await this._createTemplate(String(message.kind ?? "brief"));
      return;
    }
    if (message.type === "createStoryboard") {
      await this._createStoryboard();
      return;
    }
    if (message.type === "aiAction") {
      const item = this._items.get(String(message.id));
      const action = String(message.action ?? "improve");
      if (item) {
        const selection = typeof message.selection === "string" && message.selection.trim() ? `\n\nSelected text:\n${message.selection.slice(0, 4000)}` : "";
        const prompt = `Studio AI action: ${action}\nFile: ${item.path}\nKind: ${item.kind}\nTask: Open/inspect this file, modify only what is needed, preserve formatting where possible, create a version/checkpoint, and verify the result.${selection}`;
        if (this.enqueueChatRequest) {
          this.enqueueChatRequest(prompt);
          await vscode.commands.executeCommand("workbench.view.extension.sentinel-coder-sidebar");
          await vscode.commands.executeCommand("sentinel-coder.chatView.focus");
          this._post({ type: "saved", message: "AI request sent to Sentinel Chat." });
        } else {
          await vscode.env.clipboard.writeText(prompt);
          vscode.window.showInformationMessage("AI action prompt copied. Paste it into Sentinel Chat to run with tools.");
        }
      }
      return;
    }
  }

  private async _snapshotBeforeWrite(item: StudioFileItem, reason: string): Promise<string | undefined> {
    try {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder || !fs.existsSync(item.path)) {
        return undefined;
      }
      const versionRoot = path.join(folder.uri.fsPath, ".sentinel", "versions");
      await fs.promises.mkdir(versionRoot, { recursive: true });
      const safeRel = item.workspaceRelativePath.replace(/[\\/:*?"<>|]+/g, "__");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = path.extname(item.path) || ".txt";
      const target = path.join(versionRoot, `${safeRel}.${stamp}.${reason}${ext}.bak`);
      await fs.promises.copyFile(item.path, target);
      return target;
    } catch (error) {
      this.outputChannel.appendLine(`[Studio] Snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private _versionRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? path.join(folder.uri.fsPath, ".sentinel", "versions") : undefined;
  }

  private _safeVersionPrefix(item: StudioFileItem): string {
    return item.workspaceRelativePath.replace(/[\\/:*?"<>|]+/g, "__");
  }

  private async _listVersions(id: string): Promise<void> {
    const item = this._items.get(id);
    const versionRoot = this._versionRoot();
    if (!item || !versionRoot || !fs.existsSync(versionRoot)) {
      this._post({ type: "versions", id, versions: [] });
      return;
    }
    const prefix = this._safeVersionPrefix(item);
    const versions = fs.readdirSync(versionRoot)
      .filter((name) => name.startsWith(prefix))
      .map((name) => {
        const filePath = path.join(versionRoot, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, size: stat.size, modified: stat.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 40);
    this._post({ type: "versions", id, versions });
  }

  private async _restoreVersion(id: string, versionPath: string): Promise<void> {
    const item = this._items.get(id);
    const versionRoot = this._versionRoot();
    if (!item || !versionRoot) {
      throw new Error("File not found in Studio index.");
    }
    const resolvedVersion = path.resolve(versionPath);
    const resolvedRoot = path.resolve(versionRoot);
    if (!resolvedVersion.startsWith(resolvedRoot + path.sep) || !fs.existsSync(resolvedVersion)) {
      throw new Error("Invalid or missing Studio version snapshot.");
    }
    await this._snapshotBeforeWrite(item, "before-restore");
    await fs.promises.copyFile(resolvedVersion, item.path);
    this._post({ type: "saved", message: `Restored ${item.name} from ${path.basename(versionPath)}` });
    await this.refresh();
  }

  private async _addComment(id: string, comment: string, selection: string): Promise<void> {
    const item = this._items.get(id);
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!item || !folder) {
      throw new Error("File not found in Studio index.");
    }
    const commentsPath = path.join(folder.uri.fsPath, ".sentinel", "studio-comments.json");
    await fs.promises.mkdir(path.dirname(commentsPath), { recursive: true });
    let comments: Array<Record<string, unknown>> = [];
    try {
      comments = JSON.parse(await fs.promises.readFile(commentsPath, "utf8"));
      if (!Array.isArray(comments)) {
        comments = [];
      }
    } catch {
      comments = [];
    }
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file: item.workspaceRelativePath,
      path: item.path,
      comment: comment.trim() || "Review note",
      selection: selection.slice(0, 4000),
      createdAt: new Date().toISOString(),
    };
    comments.unshift(record);
    await fs.promises.writeFile(commentsPath, JSON.stringify(comments.slice(0, 500), null, 2), "utf8");
    this._post({ type: "saved", message: `Added Studio comment for ${item.name}` });
  }

  private async _saveTextFile(id: string, content: string): Promise<void> {
    const item = this._items.get(id);
    if (!item) {
      throw new Error("File not found in Studio index.");
    }
    if (!item.editable) {
      throw new Error("This file type is read-only in the Studio foundation view.");
    }
    const snapshot = await this._snapshotBeforeWrite(item, "manual-save");
    await fs.promises.writeFile(item.path, content, "utf8");
    vscode.window.showInformationMessage(`Saved ${item.name}${snapshot ? " with version snapshot" : ""}`);
    await this.refresh();
  }

  private _workspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Open a workspace folder first.");
    }
    return folder.uri.fsPath;
  }

  private _managedFolder(kind: string): string {
    const workspaceRoot = this._workspaceRoot();
    const normalized = kind.toLowerCase();
    const folder = normalized === "storyboard" || normalized === "video" ? path.join(workspaceRoot, GENERATED_ROOT, "videos", "storyboards")
      : normalized === "data" ? path.join(workspaceRoot, GENERATED_ROOT, "data")
      : normalized === "document" ? path.join(workspaceRoot, GENERATED_ROOT, "documents")
      : path.join(workspaceRoot, GENERATED_ROOT, "templates");
    return ensureInsideWorkspace(folder, workspaceRoot);
  }

  private async _createManagedFile(kind: string): Promise<void> {
    const workspaceRoot = this._workspaceRoot();
    const normalized = kind.toLowerCase();
    const defaultExt = normalized === "data" ? ".json" : normalized === "storyboard" || normalized === "video" ? ".json" : ".md";
    const name = await vscode.window.showInputBox({
      prompt: "Create a Studio-managed file",
      placeHolder: `brief${defaultExt}`,
      value: normalized === "storyboard" ? `sora-storyboard-${Date.now()}${defaultExt}` : `studio-${normalized}-${Date.now()}${defaultExt}`,
      validateInput: (value) => /[\\/:*?"<>|]/.test(value) ? "Use a file name only, without path separators." : undefined,
    });
    if (!name) {
      return;
    }
    const target = ensureInsideWorkspace(path.join(this._managedFolder(normalized), sanitizeFileName(name, `studio${defaultExt}`)), workspaceRoot);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      throw new Error(`File already exists: ${path.basename(target)}`);
    }
    const body = normalized === "data" ? "{\n  \"notes\": []\n}\n"
      : normalized === "storyboard" || normalized === "video" ? JSON.stringify({ title: "Untitled Sora storyboard", aspectRatio: "720x1280", shotSeconds: 4, audio: "Use natural ambient sound or generated dialogue only when requested.", shots: [{ id: 1, prompt: "Cinematic opening shot, stable camera motion, professional lighting." }] }, null, 2) + "\n"
      : `# ${path.basename(target, path.extname(target))}\n\nStart writing here.\n`;
    await fs.promises.writeFile(target, body, "utf8");
    this._post({ type: "saved", message: `Created ${path.relative(workspaceRoot, target)}` });
    await this.refresh();
    this.openFilePath(target);
  }

  private async _renameManagedFile(id: string): Promise<void> {
    const item = this._items.get(id);
    const workspaceRoot = this._workspaceRoot();
    if (!item) {
      throw new Error("File not found in Studio index.");
    }
    const name = await vscode.window.showInputBox({
      prompt: `Rename ${item.name}`,
      value: item.name,
      validateInput: (value) => /[\\/:*?"<>|]/.test(value) ? "Use a file name only, without path separators." : undefined,
    });
    if (!name || name === item.name) {
      return;
    }
    const target = ensureInsideWorkspace(path.join(path.dirname(item.path), sanitizeFileName(name, item.name)), workspaceRoot);
    if (fs.existsSync(target)) {
      throw new Error(`Target already exists: ${path.basename(target)}`);
    }
    await this._snapshotBeforeWrite(item, "before-rename");
    await fs.promises.rename(item.path, target);
    this._post({ type: "saved", message: `Renamed ${item.name} to ${path.basename(target)}` });
    await this.refresh();
    this.openFilePath(target);
  }

  private async _duplicateManagedFile(id: string): Promise<void> {
    const item = this._items.get(id);
    const workspaceRoot = this._workspaceRoot();
    if (!item) {
      throw new Error("File not found in Studio index.");
    }
    const ext = path.extname(item.path);
    const base = path.basename(item.path, ext);
    let target = path.join(path.dirname(item.path), `${base}.copy${ext}`);
    let index = 2;
    while (fs.existsSync(target)) {
      target = path.join(path.dirname(item.path), `${base}.copy-${index}${ext}`);
      index += 1;
    }
    target = ensureInsideWorkspace(target, workspaceRoot);
    await fs.promises.copyFile(item.path, target);
    this._post({ type: "saved", message: `Duplicated ${item.name}` });
    await this.refresh();
    this.openFilePath(target);
  }

  private async _deleteManagedFile(id: string): Promise<void> {
    const item = this._items.get(id);
    const workspaceRoot = this._workspaceRoot();
    if (!item) {
      throw new Error("File not found in Studio index.");
    }
    ensureInsideWorkspace(item.path, workspaceRoot);
    const answer = await vscode.window.showWarningMessage(`Delete ${item.name}? A version snapshot will be kept when possible.`, { modal: true }, "Delete");
    if (answer !== "Delete") {
      return;
    }
    await this._snapshotBeforeWrite(item, "before-delete");
    await fs.promises.unlink(item.path);
    this._post({ type: "saved", message: `Deleted ${item.name}` });
    await this.refresh();
  }

  private async _createTemplate(kind: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Open a workspace folder first.");
    }
    const root = path.join(folder.uri.fsPath, GENERATED_ROOT, "templates");
    await fs.promises.mkdir(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeKind = kind.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "brief";
    const target = path.join(root, `${safeKind}-template-${stamp}.md`);
    const body = `# ${safeKind.replace(/-/g, " ")} template

## Purpose
Describe the deliverable.

## Audience
Who will use it?

## AI actions
- Improve selected text
- Expand outline
- Create image prompt
- Create Sora storyboard

## Draft
Start writing here.
`;
    await fs.promises.writeFile(target, body, "utf8");
    this._post({ type: "saved", message: `Created template ${path.relative(folder.uri.fsPath, target)}` });
    await this.refresh();
  }

  private async _createStoryboard(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Open a workspace folder first.");
    }
    const root = path.join(folder.uri.fsPath, GENERATED_ROOT, "videos", "storyboards");
    await fs.promises.mkdir(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(root, `sora-storyboard-${stamp}.json`);
    const storyboard = {
      title: "Untitled Sora storyboard",
      aspectRatio: "720x1280",
      shotSeconds: 4,
      negativePrompt: "no blurry frames, no distorted anatomy, no fused objects, no warped logos, no unreadable text overlays, no watermark, no visual noise",
      shots: [
        { id: 1, prompt: "Opening establishing shot, cinematic commercial quality, stable camera motion." },
        { id: 2, prompt: "Product/interface hero shot, sharp focus, premium lighting." },
        { id: 3, prompt: "Closing call-to-action shot, clean composition, brand-safe." }
      ]
    };
    await fs.promises.writeFile(target, JSON.stringify(storyboard, null, 2), "utf8");
    this._post({ type: "saved", message: `Created Sora storyboard ${path.relative(folder.uri.fsPath, target)}` });
    await this.refresh();
  }

  private async _collectItems(webview: vscode.Webview): Promise<StudioFileItem[]> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    const workspaceRoot = folder.uri.fsPath;
    const generatedRoot = path.join(workspaceRoot, GENERATED_ROOT);
    const candidateRoots = [generatedRoot, workspaceRoot].filter((dir, index, arr) => fs.existsSync(dir) && arr.indexOf(dir) === index);
    const allowed = (filePath: string) => {
      const kind = fileKind(filePath);
      return kind !== "other";
    };
    const files: string[] = [];
    for (const root of candidateRoots) {
      const depth = root === workspaceRoot ? 4 : 8;
      const discovered = await walkFiles(root, depth, allowed);
      files.push(...discovered);
    }
    const unique = Array.from(new Set(files));
    const groupedCounts = new Map<string, number>();
    const items: StudioFileItem[] = [];
    for (const filePath of unique) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      const category = categoryFor(filePath, workspaceRoot);
      const currentCount = groupedCounts.get(category) ?? 0;
      if (currentCount >= MAX_LIST_ITEMS_PER_CATEGORY) {
        continue;
      }
      groupedCounts.set(category, currentCount + 1);
      const kind = fileKind(filePath);
      const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
      const canWebviewPreview = ["image", "video", "audio", "pdf"].includes(kind);
      const webviewUri = canWebviewPreview ? webview.asWebviewUri(vscode.Uri.file(filePath)).toString() : undefined;
      items.push({
        id: safeId(filePath),
        name: path.basename(filePath),
        path: filePath,
        workspaceRelativePath: rel,
        kind,
        category,
        size: stat.size,
        modified: stat.mtimeMs,
        webviewUri,
        editable: isEditableKind(kind, filePath),
        preview: readTextPreview(filePath),
      });
    }
    items.sort((a, b) => b.modified - a.modified);
    return items;
  }

  private _post(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message);
  }

  private _html(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; media-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Sentinel Studio</title>
<style>
:root { color-scheme: dark; --accent:#22d3ee; --accent2:#a78bfa; --soft:rgba(255,255,255,.055); --line:var(--vscode-panel-border); }
* { box-sizing: border-box; }
body { margin:0; height:100vh; overflow:hidden; font-family: var(--vscode-font-family); background: var(--vscode-sideBar-background); color: var(--vscode-foreground); }
.header { padding: 10px 12px; border-bottom: 1px solid var(--line); background: linear-gradient(135deg, rgba(34,211,238,.12), rgba(124,58,237,.1)); }
.title { font-weight: 800; font-size: 14px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.subtitle { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 4px; line-height: 1.35; }
.toolbar { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-radius: 8px; padding: 6px 9px; font-size: 11px; cursor:pointer; }
button.secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
button.ghost { background: transparent; color: var(--vscode-foreground); border-color: var(--line); }
button:hover { filter: brightness(1.08); }
.shell { height: calc(100vh - 88px); min-height: 420px; display:grid; grid-template-columns: minmax(230px, 34%) minmax(320px, 1fr); overflow:hidden; }
.navigator { border-right:1px solid var(--line); min-width:0; min-height:0; overflow:hidden; display:flex; flex-direction:column; background:rgba(255,255,255,.018); }
.search-row { flex:0 0 auto; padding:10px; display:grid; gap:8px; border-bottom:1px solid var(--line); }
.search { width:100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
.filter-row { display:flex; gap:5px; flex-wrap:wrap; }
.filter { padding:4px 7px; font-size:10px; border-radius:999px; background:rgba(255,255,255,.04); border:1px solid var(--line); color:var(--vscode-descriptionForeground); cursor:pointer; }
.filter.active { color:#67e8f9; border-color:rgba(34,211,238,.55); background:rgba(34,211,238,.12); }
.status { flex:0 0 auto; padding: 7px 10px; color: var(--vscode-descriptionForeground); font-size: 11px; border-bottom:1px solid var(--line); }
.tree { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding: 8px; overscroll-behavior:contain; }

.roadmap { flex:0 0 auto; margin:8px; border:1px solid rgba(103,232,249,.28); border-radius:12px; background:linear-gradient(135deg,rgba(34,211,238,.08),rgba(168,85,247,.06)); overflow:hidden; }
.roadmap summary { cursor:pointer; padding:8px 10px; font-weight:800; font-size:11px; color:#67e8f9; }
.roadmap-list { margin:0; padding:0 10px 10px 24px; color:var(--vscode-descriptionForeground); font-size:10px; line-height:1.45; }
.roadmap-list li { margin:3px 0; }

.category { margin: 0 0 8px; border: 1px solid var(--line); border-radius: 10px; overflow:hidden; background: rgba(255,255,255,.02); }
.category h3 { margin:0; padding: 8px 9px; font-size: 11px; background: rgba(255,255,255,.04); display:flex; justify-content:space-between; position:sticky; top:0; z-index:1; }
.file-row { width:100%; border:0; border-top:1px solid rgba(255,255,255,.06); background:transparent; color:var(--vscode-foreground); display:grid; grid-template-columns:18px 1fr; gap:7px; align-items:start; text-align:left; padding:8px; border-radius:0; }
.file-row:hover { background:rgba(34,211,238,.07); }
.file-row.active { background:rgba(34,211,238,.13); outline:1px solid rgba(34,211,238,.42); }
.file-name { font-weight:700; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.meta { color: var(--vscode-descriptionForeground); font-size: 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.preview-pane { min-width:0; min-height:0; overflow:hidden; display:grid; grid-template-rows:auto minmax(0,1fr) auto; background: var(--vscode-editor-background); }
.file-head { flex:0 0 auto; padding:10px 12px; border-bottom:1px solid var(--line); display:grid; gap:7px; background:rgba(255,255,255,.018); }
.file-title { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; }
.file-title strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.badge { display:inline-flex; padding:2px 7px; border-radius:999px; background: rgba(34,211,238,.12); color:#67e8f9; font-size:9px; text-transform:uppercase; letter-spacing:.04em; }
.actions { display:flex; gap:6px; flex-wrap:wrap; }
.viewer { min-height:0; overflow-y:auto; overflow-x:auto; padding:14px; min-width:0; overscroll-behavior:contain; }
.media-wrap { display:grid; place-items:center; min-height:280px; background:#05070d; border:1px solid var(--line); border-radius:14px; padding:12px; }
.viewer img, .viewer video { max-width:100%; max-height:70vh; border-radius:12px; object-fit:contain; background:#05070d; }
.viewer audio { width:100%; margin-top:12px; }
.media-note { width:100%; color:var(--vscode-descriptionForeground); font-size:11px; line-height:1.45; margin-top:10px; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:rgba(255,255,255,.035); }
.pdf-frame { width:100%; height:70vh; border:0; border-radius:12px; background:#fff; }
.editor-toolbar { display:flex; gap:5px; flex-wrap:wrap; padding:8px; border:1px solid var(--line); border-bottom:0; border-radius:12px 12px 0 0; background:rgba(255,255,255,.035); }
.editor { width:100%; min-height:55vh; max-height:calc(100vh - 260px); overflow:auto; resize:vertical; border-radius:0 0 12px 12px; border:1px solid var(--line); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding:12px; font-family: var(--vscode-editor-font-family); font-size:12px; line-height:1.55; }
.ai-panel { flex:0 0 auto; padding:10px 12px; border-top:1px solid var(--line); background:rgba(255,255,255,.018); display:grid; gap:8px; }
.ai-row { display:grid; grid-template-columns: 1fr auto auto auto auto; gap:6px; }
.ai-input { width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
.side-info { max-height:180px; overflow:auto; border:1px solid var(--line); border-radius:10px; background:rgba(255,255,255,.025); padding:8px; display:none; }
.version-row { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06); font-size:11px; }
.comment-hint { color:var(--vscode-descriptionForeground); font-size:11px; line-height:1.35; }
.empty { padding: 30px 18px; text-align:center; color: var(--vscode-descriptionForeground); }
.context-menu { position:fixed; z-index:50; min-width:190px; background:var(--vscode-menu-background); color:var(--vscode-menu-foreground); border:1px solid var(--line); border-radius:10px; box-shadow:0 14px 40px rgba(0,0,0,.35); padding:6px; display:none; }
.context-menu button { display:block; width:100%; text-align:left; background:transparent; color:inherit; border:0; border-radius:7px; padding:7px 9px; }
.context-menu button:hover { background:var(--vscode-menu-selectionBackground); color:var(--vscode-menu-selectionForeground); }
@media (max-width: 780px) { body { overflow:auto; } .shell { height:auto; min-height:0; grid-template-columns:1fr; } .navigator { max-height:42vh; border-right:0; border-bottom:1px solid var(--line); } .preview-pane { min-height:60vh; } }
</style>
</head>
<body>
  <div class="header">
    <div class="title"><span>Sentinel Studio</span><span class="badge">Media + File Manager</span></div>
    <div class="subtitle">Browse generated images, Sora videos, audio, documents and workspace files; preview with sound controls, edit text/data, version saves, and send selected content to Sentinel AI actions.</div>
    <div class="toolbar">
      <button id="refresh">Refresh</button>
      <button id="openGenerated" class="secondary">Open generated folder</button>
      <button id="newFile" class="secondary">New file</button>
      <button id="newTemplate" class="secondary">New writing template</button>
      <button id="newStoryboard" class="secondary">New Sora storyboard</button>
    </div>
  </div>
  <main class="shell">
    <aside class="navigator">
      <div class="search-row">
        <input id="search" class="search" placeholder="Search files, folders, media, docs..." />
        <div id="filters" class="filter-row"></div>
      </div>
      <div id="status" class="status">Loading...</div>
      <div id="tree" class="tree"></div>
    </aside>
    <section class="preview-pane">
      <div id="fileHead" class="file-head"><div class="empty">Select a file from the left navigator.</div></div>
      <div id="viewer" class="viewer"><div class="empty">Preview, edit, and collaborate with AI here.</div></div>
      <div class="ai-panel">
        <div class="meta">AI actions use selected text where available and send the request to Sentinel Chat context.</div>
        <div class="ai-row">
          <input id="aiInstruction" class="ai-input" placeholder="Tell AI what to do with selection/file: improve tone, expand, summarize, translate, convert to HTML..." />
          <button id="aiApply">AI edit</button>
          <button id="aiSummarize" class="secondary">Summarize</button>
          <button id="aiComment" class="secondary">Comment</button>
          <button id="versions" class="secondary">Versions</button>
        </div>
        <div id="sideInfo" class="side-info"></div>
      </div>
    </section>
  </main>
  <div id="contextMenu" class="context-menu">
    <button data-action="improve-selection">AI improve selection</button>
    <button data-action="expand-selection">AI expand selection</button>
    <button data-action="summarize-selection">AI summarize selection</button>
    <button data-action="rewrite-selection">AI rewrite with instruction</button>
  </div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let allItems = [];
let filteredItems = [];
let selectedId = null;
let activeKind = 'all';
const tree = document.getElementById('tree');
const viewer = document.getElementById('viewer');
const fileHead = document.getElementById('fileHead');
const statusEl = document.getElementById('status');
const sideInfo = document.getElementById('sideInfo');
const searchEl = document.getElementById('search');
const filtersEl = document.getElementById('filters');
const menu = document.getElementById('contextMenu');
function esc(v){return String(v||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtSize(n){ if(!n) return '0 B'; const u=['B','KB','MB','GB']; let i=0,v=n; while(v>1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i?1:0)+' '+u[i]; }
function fmtDate(ms){ try{return new Date(ms).toLocaleString();}catch{return '';} }
function iconFor(item){ return ({image:'IMG',video:'VID',audio:'AUD',pdf:'PDF',office:'DOC',text:'TXT',data:'DAT',document:'DOC',other:'FILE'}[item.kind]||'FILE'); }
function clearNode(node){ while(node.firstChild) node.removeChild(node.firstChild); }
function appendTextNode(parent, tag, className, text){ const el=document.createElement(tag); if(className) el.className=className; el.textContent=String(text||''); parent.appendChild(el); return el; }
function appendEmpty(node, text, className='empty'){ clearNode(node); appendTextNode(node, 'div', className, text); }
function selectedItem(){ return allItems.find(x => x.id === selectedId) || null; }
function applyFilters(){
  const q = searchEl.value.toLowerCase().trim();
  filteredItems = allItems.filter(item => {
    const byKind = activeKind === 'all' || item.kind === activeKind || item.category.toLowerCase().includes(activeKind);
    const byQuery = !q || item.name.toLowerCase().includes(q) || item.workspaceRelativePath.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    return byKind && byQuery;
  });
}
function renderFilters(){
  const kinds = ['all','image','video','audio','text','data','pdf','office'];
  clearNode(filtersEl);
  for(const k of kinds){
    const button = document.createElement('button');
    button.className = 'filter ' + (activeKind === k ? 'active' : '');
    button.dataset.filter = k;
    button.textContent = k;
    filtersEl.appendChild(button);
  }
}
function renderTree(){
  applyFilters();
  statusEl.textContent = filteredItems.length + ' files shown / ' + allItems.length + ' indexed';
  clearNode(tree);
  if(!filteredItems.length){ appendTextNode(tree, 'div', 'empty', 'No files found. Generate media or create documents with Sentinel to populate Studio.'); return; }
  const groups = new Map();
  for(const item of filteredItems){ if(!groups.has(item.category)) groups.set(item.category, []); groups.get(item.category).push(item); }
  for(const [category, group] of groups){
    const section = document.createElement('section');
    section.className = 'category';
    const heading = document.createElement('h3');
    appendTextNode(heading, 'span', '', category);
    appendTextNode(heading, 'span', '', String(group.length));
    section.appendChild(heading);
    for(const item of group){
      const row = document.createElement('button');
      row.className = 'file-row ' + (item.id === selectedId ? 'active' : '');
      row.dataset.select = item.id;
      row.title = item.path;
      appendTextNode(row, 'span', 'badge', iconFor(item));
      const textWrap = document.createElement('span');
      appendTextNode(textWrap, 'div', 'file-name', item.name);
      appendTextNode(textWrap, 'div', 'meta', item.workspaceRelativePath + ' - ' + fmtSize(item.size) + ' - ' + fmtDate(item.modified));
      row.appendChild(textWrap);
      section.appendChild(row);
    }
    tree.appendChild(section);
  }
}
function appendActionButton(parent, label, attrs, className){
  const button = document.createElement('button');
  if(className) button.className = className;
  button.textContent = label;
  for(const [key, value] of Object.entries(attrs || {})){
    button.setAttribute(key, String(value));
  }
  parent.appendChild(button);
  return button;
}
function editorToolbar(){
  const bar = document.createElement('div');
  bar.className = 'editor-toolbar';
  const buttons = [['bold','Bold'],['italic','Italic'],['h2','Heading'],['list','List'],['quote','Quote'],['code','Code'],['table','CSV table hint']];
  for(const [format, label] of buttons){ appendActionButton(bar, label, {'data-format': format}); }
  return bar;
}
function renderSelected(){
  const item = selectedItem();
  clearNode(fileHead);
  clearNode(viewer);
  if(!item){ appendTextNode(fileHead, 'div', 'empty', 'Select a file from the left navigator.'); appendTextNode(viewer, 'div', 'empty', 'Preview, edit, and collaborate with AI here.'); return; }
  const title = document.createElement('div');
  title.className = 'file-title';
  appendTextNode(title, 'strong', '', item.name);
  appendTextNode(title, 'span', 'badge', item.kind);
  fileHead.appendChild(title);
  appendTextNode(fileHead, 'div', 'meta', item.workspaceRelativePath + ' - ' + fmtSize(item.size) + ' - ' + fmtDate(item.modified));
  const actions = document.createElement('div');
  actions.className = 'actions';
  appendActionButton(actions, 'Open in editor', {'data-open': item.id});
  appendActionButton(actions, 'Reveal', {'data-reveal': item.id}, 'secondary');
  appendActionButton(actions, 'Duplicate', {'data-duplicate': item.id}, 'secondary');
  appendActionButton(actions, 'Rename', {'data-rename': item.id}, 'secondary');
  appendActionButton(actions, 'Delete', {'data-delete': item.id}, 'ghost');
  if(item.editable){ appendActionButton(actions, 'Save edits', {'data-save': item.id}); }
  appendActionButton(actions, 'AI improve file', {'data-ai': 'improve', 'data-id': item.id}, 'secondary');
  appendActionButton(actions, 'AI summarize', {'data-ai': 'summarize', 'data-id': item.id}, 'secondary');
  fileHead.appendChild(actions);
  if(item.kind==='image' && item.webviewUri){ const wrap=document.createElement('div'); wrap.className='media-wrap'; const img=document.createElement('img'); img.src=item.webviewUri; img.alt=item.name; wrap.appendChild(img); viewer.appendChild(wrap); return; }
  if(item.kind==='video' && item.webviewUri){ const wrap=document.createElement('div'); wrap.className='media-wrap'; const inner=document.createElement('div'); inner.style.width='100%'; inner.style.display='grid'; inner.style.placeItems='center'; const video=document.createElement('video'); video.controls=true; video.preload='metadata'; video.playsInline=true; video.muted=false; video.volume=1; video.src=item.webviewUri; inner.appendChild(video); const note=document.createElement('div'); note.className='media-note'; note.textContent='Video preview uses native VS Code webview media controls. If the generated Sora MP4 contains audio, unmute/adjust volume in the player; if there is no audio track, generate or attach voiceover with Azure Speech and combine externally.'; inner.appendChild(note); wrap.appendChild(inner); viewer.appendChild(wrap); return; }
  if(item.kind==='audio' && item.webviewUri){ const wrap=document.createElement('div'); wrap.className='media-wrap'; const inner=document.createElement('div'); inner.style.width='100%'; const audio=document.createElement('audio'); audio.controls=true; audio.preload='metadata'; audio.volume=1; audio.src=item.webviewUri; inner.appendChild(audio); const note=document.createElement('div'); note.className='media-note'; note.textContent='Audio preview is enabled with native controls for generated speech, transcripts, narration, and exported sound files.'; inner.appendChild(note); wrap.appendChild(inner); viewer.appendChild(wrap); return; }
  if(item.kind==='pdf' && item.webviewUri){ const frame=document.createElement('iframe'); frame.className='pdf-frame'; frame.src=item.webviewUri; viewer.appendChild(frame); return; }
  if(item.preview !== undefined && item.editable){ viewer.appendChild(editorToolbar()); const area=document.createElement('textarea'); area.id='activeEditor'; area.className='editor'; area.spellcheck=false; area.value=item.preview; viewer.appendChild(area); return; }
  if(item.preview !== undefined){ const pre=document.createElement('pre'); pre.className='editor'; pre.textContent=item.preview; viewer.appendChild(pre); return; }
  appendTextNode(viewer, 'div', 'empty', 'Preview not available yet. Use Open in editor, or ask AI to inspect/convert this file.');
}
function renderVersions(msg){
  const versions = msg.versions || [];
  sideInfo.style.display = 'block';
  clearNode(sideInfo);
  if(!versions.length){ appendTextNode(sideInfo, 'div', 'comment-hint', 'No version snapshots yet. Save an editable file to create snapshots automatically.'); return; }
  appendTextNode(sideInfo, 'strong', '', 'Version history');
  for(const v of versions){
    const row = document.createElement('div');
    row.className = 'version-row';
    const detail = document.createElement('span');
    detail.title = v.path || '';
    detail.appendChild(document.createTextNode(v.name || 'snapshot'));
    detail.appendChild(document.createElement('br'));
    appendTextNode(detail, 'span', 'meta', fmtSize(v.size) + ' - ' + fmtDate(v.modified));
    row.appendChild(detail);
    appendActionButton(row, 'Restore', {'data-restore': v.path || ''});
    sideInfo.appendChild(row);
  }
}
function applyFormat(kind){
  const area = document.getElementById('activeEditor');
  if(!area) return;
  const start = area.selectionStart || 0, end = area.selectionEnd || 0;
  const text = area.value.slice(start, end) || 'text';
  const wrappers = {
    bold:['**','**'], italic:['*','*'], h2:['\\n## ','\\n'], list:['\\n- ',''], quote:['\\n> ',''], code:['\`','\`'], table:['\\n| Column | Value |\\n|---|---|\\n| Example | Data |\\n','']
  };
  const w = wrappers[kind] || ['', ''];
  area.setRangeText(w[0]+text+w[1], start, end, 'end');
  area.focus();
}
function selectedText(){ return String(window.getSelection ? window.getSelection() : '').trim(); }
function sendAi(action){
  const item = selectedItem(); if(!item) return;
  const instruction = document.getElementById('aiInstruction').value || action;
  vscode.postMessage({type:'aiAction', id:item.id, action:instruction, selection:selectedText()});
}
function showVersions(){ const item = selectedItem(); if(item) vscode.postMessage({type:'listVersions', id:item.id}); }
function addComment(){ const item = selectedItem(); if(!item) return; const note = document.getElementById('aiInstruction').value || 'Review note'; vscode.postMessage({type:'addComment', id:item.id, comment:note, selection:selectedText()}); }
function hideMenu(){ menu.style.display='none'; }
function renderAll(){ renderFilters(); renderTree(); renderSelected(); }
tree.addEventListener('click', event => { const target = event.target.closest('[data-select]'); if(target){ selectedId = target.getAttribute('data-select'); renderAll(); }});
fileHead.addEventListener('click', event => {
  const target = event.target; if(!(target instanceof HTMLElement)) return;
  const open = target.getAttribute('data-open'); if(open) vscode.postMessage({type:'open', id:open});
  const reveal = target.getAttribute('data-reveal'); if(reveal) vscode.postMessage({type:'reveal', id:reveal});
  const duplicate = target.getAttribute('data-duplicate'); if(duplicate) vscode.postMessage({type:'duplicateFile', id:duplicate});
  const rename = target.getAttribute('data-rename'); if(rename) vscode.postMessage({type:'renameFile', id:rename});
  const del = target.getAttribute('data-delete'); if(del) vscode.postMessage({type:'deleteFile', id:del});
  const save = target.getAttribute('data-save'); if(save){ const area = document.getElementById('activeEditor'); vscode.postMessage({type:'save', id:save, content: area ? area.value : ''}); }
  const ai = target.getAttribute('data-ai'); const id = target.getAttribute('data-id'); if(ai && id) vscode.postMessage({type:'aiAction', id, action:ai, selection:selectedText()});
});
viewer.addEventListener('click', event => { const target = event.target; if(target instanceof HTMLElement && target.getAttribute('data-format')) applyFormat(target.getAttribute('data-format')); });
viewer.addEventListener('contextmenu', event => { event.preventDefault(); menu.style.left=event.clientX+'px'; menu.style.top=event.clientY+'px'; menu.style.display='block'; });
menu.addEventListener('click', event => { const target=event.target; if(target instanceof HTMLElement && target.dataset.action){ sendAi(target.dataset.action); hideMenu(); }});
document.addEventListener('click', event => { if(!menu.contains(event.target)) hideMenu(); });
filtersEl.addEventListener('click', event => { const target=event.target; if(target instanceof HTMLElement && target.dataset.filter){ activeKind=target.dataset.filter; renderAll(); }});
searchEl.addEventListener('input', renderAll);
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({type:'refresh'}));
document.getElementById('openGenerated').addEventListener('click', () => vscode.postMessage({type:'openGeneratedFolder'}));
document.getElementById('newFile').addEventListener('click', () => vscode.postMessage({type:'createFile', kind:'markdown'}));
document.getElementById('newTemplate').addEventListener('click', () => vscode.postMessage({type:'createTemplate', kind:'office-brief'}));
document.getElementById('newStoryboard').addEventListener('click', () => vscode.postMessage({type:'createStoryboard'}));
document.getElementById('aiApply').addEventListener('click', () => sendAi('edit selected/file'));
document.getElementById('aiSummarize').addEventListener('click', () => sendAi('summarize selected/file'));
document.getElementById('aiComment').addEventListener('click', addComment);
document.getElementById('versions').addEventListener('click', showVersions);
sideInfo.addEventListener('click', event => { const target = event.target; if(target instanceof HTMLElement && target.dataset.restore){ const item=selectedItem(); if(item) vscode.postMessage({type:'restoreVersion', id:item.id, versionPath:target.dataset.restore}); }});
window.addEventListener('message', event => { const msg = event.data; if(msg.type==='items'){ allItems = msg.items || []; if(!selectedId && allItems[0]) selectedId = allItems[0].id; renderAll(); } if(msg.type==='versions'){ renderVersions(msg); } if(msg.type==='saved'){ statusEl.textContent = msg.message || 'Saved.'; } if(msg.type==='error'){ statusEl.textContent = msg.message; } });
vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
  }
}
