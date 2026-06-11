import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { OllamaClient } from "./ollama";
import { MultiProviderClient, ChatMessage, ModelOption, classifyTask, getModelCapability, ToolCallSpec } from "./providers";
import { ToolRegistry, parseToolCalls, ApprovalMode, shouldAutoApprove } from "./toolRegistry";
import { McpManager } from "./mcpClient";

// Persistent chat history path (all sessions appended here, ingested into RAG)
const CHAT_HISTORY_PATH = path.join("D:", "QubitDev", "training", "chat_history.jsonl");

export type ChatMode = "agent" | "ask" | "plan";

/** A persisted chat session that the user can resume, rename, or delete. */
export interface ChatSession {
  id: string;
  title: string;
  model: string;
  mode: ChatMode;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = "sentinelCoder.sessions";
const CURRENT_SESSION_KEY = "sentinelCoder.currentSessionId";
const MAX_SESSIONS = 100;
const SKILLS_KEY = "sentinelCoder.skills";

/** A reusable instruction pack injected into the system prompt when enabled. */
export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  source?: string; // "manual" | "import:<path>"
}

export type AgenticCostPolicy = "quality-first" | "balanced" | "cost-first" | "novelty-lab";

/** User-editable multi-agent workflow profile. */
export interface AgenticProfile {
  id: string;
  name: string;
  description: string;
  mainModel: string;
  workerModels: string[];
  reviewerModels: string[];
  defaultWorkerModel: string;
  allowCheapFallback: boolean;
  allowPremiumWorkers: boolean;
  maxParallelAgents: number;
  costPolicy: AgenticCostPolicy;
  instructions: string;
  source?: "builtin" | "manual";
  createdAt: number;
  updatedAt: number;
}

const AGENTIC_PROFILES_KEY = "sentinelCoder.agenticProfiles";
const CURRENT_AGENTIC_PROFILE_KEY = "sentinelCoder.currentAgenticProfileId";
const STANDARD_AGENTIC_PROFILE_ID = "profile_standard_single_model";
const DYNAMIC_CONTEXT_KEY = "sentinelCoder.dynamicContext";

export interface DynamicContextSettings {
  enabled: boolean;
  includeActiveFile: boolean;
  includeOpenTabs: boolean;
  includeDiagnostics: boolean;
  includeGitStatus: boolean;
  includeProviderMetadata: boolean;
  includeRecentChanges: boolean;
  maxChars: number;
}

type TurnAgentRole = "main" | "subagent" | "team";

interface TurnAgentUsage {
  role: TurnAgentRole;
  label: string;
  model: string;
  calls: number;
  task?: string;
  outputTokens?: number;
  elapsedMs?: number;
}

const DEFAULT_DYNAMIC_CONTEXT: DynamicContextSettings = {
  enabled: true,
  includeActiveFile: true,
  includeOpenTabs: true,
  includeDiagnostics: true,
  includeGitStatus: true,
  includeProviderMetadata: true,
  includeRecentChanges: true,
  maxChars: 8000,
};


const BUILTIN_AGENTIC_PROFILES: Array<Omit<AgenticProfile, "createdAt" | "updatedAt">> = [
  {
    id: STANDARD_AGENTIC_PROFILE_ID,
    name: "Standard: Single Model Full Capability",
    description: "Default standard profile/reference: when you choose a normal model, Sentinel uses that model directly at its discovered context/output capability; no multi-agent orchestration is applied unless an Agentic profile is explicitly selected.",
    mainModel: "auto",
    workerModels: [],
    reviewerModels: [],
    defaultWorkerModel: "auto",
    allowCheapFallback: false,
    allowPremiumWorkers: false,
    maxParallelAgents: 1,
    costPolicy: "balanced",
    instructions: "Standard single-model mode. Do not spawn sub-agents automatically. Use the selected model directly with its discovered provider context window and output limit, bounded only by user context budget/max-token settings. Switch to another Agentic profile only when you want boss/worker/reviewer orchestration."
  },
  {
    id: "profile_premium_architect",
    name: "Premium Architect + Strong Agents",
    description: "Best quality: GPT-5.5 orchestrates, GPT-4.1/Grok-4.3 handle hard sub-agent work, cheaper models only as fallback.",
    mainModel: "azure:gpt-5.5",
    workerModels: ["azure:gpt-4.1", "azure:grok-4.3", "azure:gpt-5.4"],
    reviewerModels: ["azure:gpt-5.5", "azure:gpt-5.4-pro", "azure:gpt-4.1"],
    defaultWorkerModel: "azure:gpt-4.1",
    allowCheapFallback: true,
    allowPremiumWorkers: true,
    maxParallelAgents: 4,
    costPolicy: "quality-first",
    instructions: "Use premium sub-agents for architecture, code edits, security, financial/business reasoning, and final-quality drafts. Use cheaper/free models only for broad brainstorming, repetitive extraction, or fallback. Main model must verify and apply final changes."
  },
  {
    id: "profile_balanced_azure",
    name: "Balanced Azure Boss + Budget Drafts",
    description: "Balanced cost/quality: GPT-4.1 orchestrates, Grok/GPT-4.1 review hard work, free workers can draft low-risk boilerplate.",
    mainModel: "azure:gpt-4.1",
    workerModels: ["azure:grok-4.3", "azure:gpt-4.1", "groq:openai/gpt-oss-120b", "openrouter:qwen/qwen3-coder:free"],
    reviewerModels: ["azure:gpt-5.5", "azure:gpt-4.1", "azure:grok-4.3"],
    defaultWorkerModel: "azure:grok-4.3",
    allowCheapFallback: true,
    allowPremiumWorkers: true,
    maxParallelAgents: 5,
    costPolicy: "balanced",
    instructions: "Default to Azure GPT-4.1/Grok-4.3 for meaningful sub-agent work. Use free/cheap workers for first-pass research, boilerplate, extraction, and alternative ideas. Escalate weak outputs to premium reviewer."
  },
  {
    id: "profile_azure_cost_smart_production",
    name: "Azure Cost-Smart Production",
    description: "Recommended for your current Azure spend: GPT-4.1/Grok do most work; GPT-5.5 is reserved for final hard review, architecture, security, and high-risk decisions.",
    mainModel: "azure:gpt-4.1",
    workerModels: ["azure:grok-4.3", "azure:gpt-4.1", "azure:model-router", "groq:openai/gpt-oss-120b"],
    reviewerModels: ["azure:gpt-5.5", "azure:gpt-5.4-pro", "azure:gpt-4.1"],
    defaultWorkerModel: "azure:grok-4.3",
    allowCheapFallback: true,
    allowPremiumWorkers: true,
    maxParallelAgents: 3,
    costPolicy: "balanced",
    instructions: "Use GPT-4.1 as the orchestrator for coding and editing. Use Grok-4.3 for alternative reasoning, critique, and code review. Use Model Router or free/Groq OSS only for extraction, boilerplate, or broad brainstorming. Escalate to GPT-5.5 only for final hard critique, security-sensitive review, architecture tradeoffs, financial strategy, or when cheaper models disagree. Keep dynamic context tight; prefer targeted file reads/RAG over dumping full history."
  },
  {
    id: "profile_cost_saving_research_swarm",
    name: "Cost-Saving Research Swarm",
    description: "Cheap/free agents fan out for research and alternatives; Azure reviewer/main model verifies and finalizes.",
    mainModel: "azure:gpt-4.1",
    workerModels: ["groq:openai/gpt-oss-120b", "groq:qwen/qwen3-32b", "openrouter:qwen/qwen3-coder:free", "openrouter:qwen/qwen3-next-80b-a3b-instruct:free"],
    reviewerModels: ["azure:gpt-4.1", "azure:gpt-5.5", "azure:grok-4.3"],
    defaultWorkerModel: "groq:openai/gpt-oss-120b",
    allowCheapFallback: true,
    allowPremiumWorkers: false,
    maxParallelAgents: 5,
    costPolicy: "cost-first",
    instructions: "Use free/cheap workers only for non-final drafts, research, extraction, critique lists, test ideas, and brainstorming. Never accept worker output directly; main Azure model must verify, rewrite, and apply final work."
  },
  {
    id: "profile_novelty_lab",
    name: "Novelty Lab: Diverse Opinions + Premium Judge",
    description: "Novelty/cost-saving experiment: diverse cheap/free models generate competing options, premium reviewer ranks and merges.",
    mainModel: "azure:gpt-5.5",
    workerModels: ["azure:grok-4.3", "groq:openai/gpt-oss-120b", "groq:qwen/qwen3-32b", "openrouter:qwen/qwen3-next-80b-a3b-instruct:free"],
    reviewerModels: ["azure:gpt-5.5", "azure:gpt-4.1"],
    defaultWorkerModel: "azure:grok-4.3",
    allowCheapFallback: true,
    allowPremiumWorkers: true,
    maxParallelAgents: 5,
    costPolicy: "novelty-lab",
    instructions: "For strategy, product, architecture, and critiques, ask different workers for genuinely different approaches. Main model must compare, rank, synthesize, and choose the safest executable plan."
  }
];

/** Bumped whenever BUILTIN_SKILLS content changes so existing installs re-sync. */
const BUILTIN_SKILLS_VERSION_KEY = "sentinelCoder.builtinSkillsVersion";

/** Default, stack-focused skills shipped with the extension and enabled by
 * default so every chat session starts with the team's conventions loaded.
 * Generic and reusable — NO secrets, IPs, hostnames, or credentials. */
const BUILTIN_SKILLS: Array<{ id: string; name: string; description: string; body: string }> = [
  {
    id: "builtin_cost_orchestrator",
    name: "Configurable Agentic Orchestrator",
    description: "Use the selected Agentic Profile to choose main, worker, reviewer, and fallback models instead of forcing cheap/free agents.",
    body: [
      "When a multi-agent workflow is useful, follow the selected Agentic Profile rather than hardcoding cheap/free workers:",
      "1. PLAN the task into concrete, independent sub-tasks with risk labels (low/medium/high).",
      "2. Use delegateSubAgent(model:\"worker\") or delegateTeam with the profile worker pool for drafts, extraction, tests, or independent research.",
      "3. Use delegateSubAgent(model:\"reviewer\") or an explicit premium model from the profile for high-risk architecture, security, financial, release, or production-code review.",
      "4. Cheap/free models are allowed only when the active profile permits them or the sub-task is low-risk; otherwise prefer the profile's stronger worker/reviewer models such as GPT-4.1 or Grok-4.3.",
      "5. REVIEW every worker result critically: correctness, security (OWASP), edge cases, style, and whether it actually meets the requirement.",
      "6. CORRECT & FINALIZE: the main model must fix mistakes, apply final changes with tools, and verify with diagnostics/build/tests before declaring success.",
      "Use Settings > Agentic Profiles to create, edit, delete, and select orchestration flows. Tools used: delegateSubAgent, delegateTeam.",
    ].join("\n"),
  },
  {
    id: "builtin_azure_first",
    name: "Azure-First Multi-Provider",
    description: "Prefer Azure for provisioning; otherwise pick the cheapest capable provider. Never hardcode secrets.",
    body: [
      "Cloud & model provider conventions:",
      "- AZURE-FIRST for provisioning new managed services (the user has Azure credits). Check existing Azure resources before defaulting to another provider.",
      "- For everyday model calls, prefer the cheapest capable provider (free tiers first) to preserve credits.",
      "- Multiple providers may be configured (Azure OpenAI, Groq, OpenRouter, Gemini, HuggingFace, local Ollama). Pick per task: fast/cheap for drafts, strong reasoning models for final review.",
      "- NEVER hardcode API keys, tokens, or connection strings in source. Read them from environment variables or a git-ignored secrets file.",
      "- When provisioning, use infrastructure-as-code or documented CLI commands; surface the resource/region used.",
    ].join("\n"),
  },
  {
    id: "builtin_web_stack",
    name: "Next.js + Headless Commerce Stack",
    description: "Conventions for Next.js 15 App Router + headless commerce/CMS + PostgreSQL + Redis projects.",
    body: [
      "Default web stack conventions (Next.js 15 App Router + headless commerce backend + PostgreSQL + Redis):",
      "- UI: Tailwind CSS + shadcn/ui + Radix primitives + Lucide icons. Keep components accessible.",
      "- ALWAYS run the production build (e.g. `npm run build`) BEFORE restarting the process — a stale build directory causes 502s.",
      "- For apps mounted under a basePath, prefix every client `fetch()` and `window.location` navigation with that basePath.",
      "- Dynamic pages that must not be cached: set `export const dynamic = \"force-dynamic\"` and `export const revalidate = 0`.",
      "- Database pools: prefer discrete field-style env vars (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD) over a single connection string.",
      "- i18n: auto-detect locale from the URL segment; never hardcode a language code.",
      "- After deploy: verify a real asset/route returns HTTP 200 through the edge/proxy — do not trust the process manager status alone.",
    ].join("\n"),
  },
  {
    id: "builtin_workspace_conventions",
    name: "Workspace & Terminal Conventions",
    description: "Shell, Python, encoding, and file-organization rules for this workspace.",
    body: [
      "Workspace and terminal conventions:",
      "- Chain shell commands with ';' (PowerShell), never '&&'.",
      "- On Windows, set UTF-8 before running Python: `$env:PYTHONIOENCODING=\"utf-8\"; $env:PYTHONUTF8=\"1\"`.",
      "- Keep the repo root clean: put scripts in categorized folders (training/, datasets/, packages/, scripts/, scripts/diag/, scripts/deploy/) — do NOT add loose scripts to the project root.",
      "- Prefer the workspace's optimized read/search tools over raw shell `grep`/`find`/`cat` when available.",
      "- Read a file before editing it; make minimal, targeted edits and validate with diagnostics/build after each change.",
    ].join("\n"),
  },
  {
    id: "builtin_deploy_discipline",
    name: "Deploy & Verification Discipline",
    description: "Build, secret-scan, and end-to-end verification rules before and after shipping.",
    body: [
      "Deployment and verification discipline:",
      "- Build must succeed (compiler/linter exit 0) before packaging or restarting anything.",
      "- Secret-scan build output before publishing: confirm no API-key prefixes/tokens leaked into compiled artifacts.",
      "- When multiple environments/servers exist, check EACH one — never assume a shared process.",
      "- After deploy, verify end-to-end with a real request (curl/HTTP 200 on a real asset) — not just process status.",
      "- NEVER ship mock, fake, placeholder, or demo data in production flows. Use real provider/public data, or clearly mark/block when unavailable.",
      "- Do not skip any item in a user's list; deliver all of it and verify each end-to-end.",
    ].join("\n"),
  },
  {
    id: "builtin_vscode_ext",
    name: "VS Code Extension Authoring",
    description: "Build/package/publish quirks and webview safety rules for VS Code extensions.",
    body: [
      "VS Code extension authoring conventions:",
      "- Compile with `npx tsc -p ./` and require EXIT 0 before packaging.",
      "- Package with `npx vsce package --no-dependencies`; install locally with `code --install-extension <vsix> --force`.",
      "- The publish step may emit a deprecation warning that makes the shell report a non-zero exit even though 'DONE Published' means success — confirm via the printed success line.",
      "- In webviews, NEVER use window.alert/confirm/prompt (they are no-ops); build in-webview modal dialogs instead.",
      "- Respect a strict Content-Security-Policy: load scripts/styles only from the extension's own webview URIs.",
      "- Keep secrets out of bundled media/out files; .vscodeignore should exclude scratch/test files.",
    ].join("\n"),
  },
  {
    id: "builtin_agentic_workflow",
    name: "Agentic Workflow (Plan → Act → Verify)",
    description: "How to drive multi-step tasks reliably: plan, use tools, verify with diagnostics, and revert on failure.",
    body: [
      "Agentic workflow discipline for non-trivial (3+ step) tasks:",
      "1. PLAN FIRST: call updatePlan with concrete steps {title, status} and keep it current (pending → in-progress → done) so the user sees live progress.",
      "2. GROUND IN THE CODEBASE: use codebaseSearch for 'where/how does X work' questions and searchText for exact strings/symbols before editing. Read a file before you edit it.",
      "3. ACT WITH TOOLS, NOT PROSE: actually call createFile/editFile/runCommand — don't just describe changes. Make minimal, unique-match edits.",
      "4. BATCH READS: when you need several read-only lookups, request them together so they run in parallel.",
      "5. VERIFY BEFORE DONE: after edits, diagnostics on touched files are auto-checked; if errors remain, fix them before declaring success. Run the build/tests when relevant.",
      "6. DON'T LOOP: if a tool returns the same result twice, change approach instead of repeating the identical call.",
      "7. RECOVER: if a turn goes wrong, the changed files can be reverted from the saved checkpoints — prefer that over leaving a half-broken state.",
    ].join("\n"),
  },
  {
    id: "builtin_test_driven",
    name: "Test-Driven & Self-Verifying Changes",
    description: "Prove changes work with real tests and real commands — never claim success without evidence.",
    body: [
      "Test-driven, evidence-based development:",
      "- Prefer writing or running a test that demonstrates the fix BEFORE claiming it works; for bugs, reproduce first, then fix.",
      "- Run the real command (build, unit test, lint, type-check) via runCommand and read the actual output — do not assume success.",
      "- Treat a non-zero exit, a stack trace, or a failing assertion as 'not done' — diagnose and fix, don't retry blindly.",
      "- NEVER fabricate test results, sample output, or 'it should work' claims. Show the real result.",
      "- For UI/behavioral changes with no test harness, exercise the actual path (e.g. a real request) and report the observed result.",
    ].join("\n"),
  },
];

export class SentinelSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sentinel-coder.chatView";
  private _view?: vscode.WebviewView;
  private _conversationHistory: ChatMessage[] = [];
  private _mode: ChatMode = "agent";
  private _approvalMode: ApprovalMode = "default";
  // Boss Orchestrator: when on, the selected (premium) model acts as a manager —
  // it delegates the heavy building to cheap/free worker models and spends its own
  // tokens only on planning, review, critique, correction and final production output.
  private _orchestration: "off" | "boss" = "off";
  private _selectedModel: string = "azure:grok-4.3";
  // Per-turn agent state: files written this turn, checkpoint snapshots (path →
  // original content or null if the file was newly created), auto-verify attempts,
  // and the live plan the model maintains via updatePlan.
  private _filesTouchedThisTurn: Set<string> = new Set();
  private _checkpoints: Map<string, string | null> = new Map();
  private _verifyAttempts = 0;
  private _currentPlan: Array<{ title: string; status: string }> = [];
  private _toolRegistry: ToolRegistry;
  private _abortController: AbortController | null = null;
  // The chat session that owns the in-flight turn. A turn keeps streaming and
  // persisting into THIS session even if the user switches to another chat, so
  // output is never lost or misrouted. null when idle.
  private _activeTurnSessionId: string | null = null;
  private _activeTurnHistory: ChatMessage[] | null = null;
  private _activeTurnAssistant: ChatMessage | null = null;
  private _queuedUserMessages: Array<{ message: string; firewallEnabled: boolean }> = [];
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;
  private _multiClient: MultiProviderClient;
  private _cachedModels: ModelOption[] = [];
  private _mcpManager: McpManager;
  private _context?: vscode.ExtensionContext;
  private _sessions: ChatSession[] = [];
  private _currentSessionId: string = "";
  private _skills: Skill[] = [];
  private _agenticProfiles: AgenticProfile[] = [];
  private _currentAgenticProfileId: string = "";
  private _dynamicContext: DynamicContextSettings = { ...DEFAULT_DYNAMIC_CONTEXT };
  private _lastDynamicContextHash: string = "";
  private _turnAgentUsage: TurnAgentUsage[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: OllamaClient,
    private readonly _outputChannel: vscode.OutputChannel,
    toolRegistry?: ToolRegistry,
    multiClient?: MultiProviderClient,
    context?: vscode.ExtensionContext
  ) {
    this._toolRegistry = toolRegistry || new ToolRegistry();
    this._multiClient = multiClient || new MultiProviderClient();
    this._mcpManager = new McpManager(_outputChannel);
    this._context = context;
    this._migrateMaxTokensToAuto();
    this._loadSessions();
    this._loadSkills();
    this._loadAgenticProfiles();
    this._loadDynamicContextSettings();
  }

  /**
   * One-time migration: older builds shipped a small fixed maxTokens default
   * (2048 / 8192) that silently truncated long answers on large models. Move
   * those legacy values to 0 (Auto = model's full output capacity) so existing
   * users stop getting cut off mid-response. Runs once per machine.
   */
  private _migrateMaxTokensToAuto() {
    if (!this._context) return;
    const DONE_KEY = "sentinelCoder.maxTokensAutoMigrated";
    if (this._context.globalState.get<boolean>(DONE_KEY, false)) return;
    const cfg = vscode.workspace.getConfiguration("sentinelCoder");
    const inspected = cfg.inspect<number>("maxTokens");
    const current = inspected?.globalValue;
    if (typeof current === "number" && current > 0 && current <= 8192) {
      void cfg.update("maxTokens", 0, vscode.ConfigurationTarget.Global);
    }
    void this._context.globalState.update(DONE_KEY, true);
  }

  // ── Session persistence (globalState — survives reloads & restarts) ─────────
  private _loadSessions() {
    if (!this._context) return;
    this._sessions = this._context.globalState.get<ChatSession[]>(SESSIONS_KEY, []) || [];
    this._currentSessionId = this._context.globalState.get<string>(CURRENT_SESSION_KEY, "") || "";
    const current = this._sessions.find(s => s.id === this._currentSessionId);
    if (current) {
      // Share the SAME array as the session so any push is reflected in storage.
      this._conversationHistory = current.messages;
      this._selectedModel = current.model || this._selectedModel;
      this._mode = current.mode || this._mode;
    }
  }

  private async _saveSessions() {
    if (!this._context) return;
    // Cap stored sessions to the most-recently-updated MAX_SESSIONS.
    this._sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    if (this._sessions.length > MAX_SESSIONS) this._sessions = this._sessions.slice(0, MAX_SESSIONS);
    await this._context.globalState.update(SESSIONS_KEY, this._sessions);
    await this._context.globalState.update(CURRENT_SESSION_KEY, this._currentSessionId);
  }

  private _genId(): string {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }


  // ── Agentic Profiles (user-editable orchestration workflows) ─────────────
  private _loadAgenticProfiles() {
    if (!this._context) return;
    this._agenticProfiles = this._context.globalState.get<AgenticProfile[]>(AGENTIC_PROFILES_KEY, []) || [];
    this._currentAgenticProfileId = this._context.globalState.get<string>(CURRENT_AGENTIC_PROFILE_KEY, "") || "";
    this._seedBuiltinAgenticProfiles();
  }

  private _seedBuiltinAgenticProfiles() {
    const now = Date.now();
    let changed = false;
    for (const def of BUILTIN_AGENTIC_PROFILES) {
      const existing = this._agenticProfiles.find(p => p.id === def.id && p.source === "builtin");
      if (existing) {
        Object.assign(existing, def, { updatedAt: existing.updatedAt || now });
      } else {
        this._agenticProfiles.push({ ...def, source: "builtin", createdAt: now, updatedAt: now });
        changed = true;
      }
    }
    if (changed) void this._saveAgenticProfiles();
  }

  private async _saveAgenticProfiles() {
    if (!this._context) return;
    await this._context.globalState.update(AGENTIC_PROFILES_KEY, this._agenticProfiles);
    await this._context.globalState.update(CURRENT_AGENTIC_PROFILE_KEY, this._currentAgenticProfileId);
  }

  private _postAgenticProfiles() {
    this._view?.webview.postMessage({ type: "agenticProfileList", profiles: this._agenticProfiles, currentId: this._currentAgenticProfileId });
  }

  private _getAgenticProfileFromSelection(selection?: string): AgenticProfile | undefined {
    const sel = selection || this._selectedModel;
    if (!sel || !sel.startsWith("agentic:")) return undefined;
    const profileId = sel.slice("agentic:".length);
    if (profileId === STANDARD_AGENTIC_PROFILE_ID) return undefined;
    return this._agenticProfiles.find(p => p.id === profileId);
  }

  private _activeAgenticProfile(): AgenticProfile | undefined {
    return this._getAgenticProfileFromSelection(this._selectedModel);
  }

  private _isStandardSingleModelSelection(selection?: string): boolean {
    return (selection || this._selectedModel) === `agentic:${STANDARD_AGENTIC_PROFILE_ID}`;
  }

  private _availableModel(id: string): boolean { return !!id && this._cachedModels.some(m => m.id === id); }

  private _firstAvailable(ids: string[] | undefined, exclude?: string): string | undefined {
    for (const id of ids || []) if (id && id !== exclude && this._availableModel(id)) return id;
    return undefined;
  }

  private _profileMainModel(profile: AgenticProfile): string {
    if (this._availableModel(profile.mainModel)) return profile.mainModel;
    return this._firstAvailable(profile.reviewerModels) || this._firstAvailable(profile.workerModels) || this._cachedModels[0]?.id || "ollama:sentinel-coder:latest";
  }

  private async _upsertAgenticProfile(data: any) {
    const now = Date.now();
    const name = String(data.name || "").trim();
    const mainModel = String(data.mainModel || "").trim();
    if (!name || !mainModel) {
      this._view?.webview.postMessage({ type: "systemNote", content: "Agentic profile needs a name and main model." });
      return;
    }
    const cleanList = (v: unknown): string[] => Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : String(v || "").split(/[\n,]/).map(x => x.trim()).filter(Boolean);
    const workers = cleanList(data.workerModels);
    const profile: AgenticProfile = {
      id: data.id ? String(data.id) : this._genId(),
      name,
      description: String(data.description || "").trim(),
      mainModel,
      workerModels: workers,
      reviewerModels: cleanList(data.reviewerModels),
      defaultWorkerModel: String(data.defaultWorkerModel || "").trim() || workers[0] || mainModel,
      allowCheapFallback: !!data.allowCheapFallback,
      allowPremiumWorkers: !!data.allowPremiumWorkers,
      maxParallelAgents: Math.max(1, Math.min(5, Number(data.maxParallelAgents || 3))),
      costPolicy: (["quality-first", "balanced", "cost-first", "novelty-lab"].includes(String(data.costPolicy)) ? String(data.costPolicy) : "balanced") as AgenticCostPolicy,
      instructions: String(data.instructions || "").trim(),
      source: data.source === "builtin" ? "builtin" : "manual",
      createdAt: now,
      updatedAt: now,
    };
    const idx = this._agenticProfiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profile.createdAt = this._agenticProfiles[idx].createdAt || now;
      profile.source = this._agenticProfiles[idx].source === "builtin" ? "builtin" : profile.source;
      this._agenticProfiles[idx] = profile;
    } else this._agenticProfiles.push(profile);
    this._currentAgenticProfileId = profile.id;
    await this._saveAgenticProfiles();
    this._postAgenticProfiles();
    await this._refreshModels();
    this._view?.webview.postMessage({ type: "systemNote", content: `Agentic profile "${name}" saved.` });
  }

  private async _deleteAgenticProfile(id: string) {
    const before = this._agenticProfiles.length;
    this._agenticProfiles = this._agenticProfiles.filter(p => p.id !== id);
    if (this._agenticProfiles.length === before) return;
    if (this._currentAgenticProfileId === id) this._currentAgenticProfileId = this._agenticProfiles[0]?.id || "";
    if (this._selectedModel === `agentic:${id}`) this._selectedModel = this._currentAgenticProfileId ? `agentic:${this._currentAgenticProfileId}` : "auto";
    await this._saveAgenticProfiles();
    this._postAgenticProfiles();
    await this._refreshModels();
  }

  private async _selectAgenticProfile(id: string) {
    const p = this._agenticProfiles.find(x => x.id === id);
    if (!p) return;
    this._currentAgenticProfileId = id;
    this._selectedModel = `agentic:${id}`;
    await this._saveAgenticProfiles();
    this._postAgenticProfiles();
    await this._refreshModels();
    const note = id === STANDARD_AGENTIC_PROFILE_ID
      ? "Standard single-model mode active: choose any normal model or Auto to use that model directly at its discovered capability; no Agentic worker/reviewer orchestration will run."
      : `Agentic profile active: ${p.name} (main: ${p.mainModel}).`;
    this._view?.webview.postMessage({ type: "systemNote", content: note });
  }

  // ── Skills (reusable instruction packs injected into the system prompt) ─────
  // Dynamic Context (auto-refresh Copilot-style repo/editor/provider context)
  private _loadDynamicContextSettings() {
    if (!this._context) return;
    const cfg = vscode.workspace.getConfiguration("sentinelCoder");
    const saved = this._context.globalState.get<Partial<DynamicContextSettings>>(DYNAMIC_CONTEXT_KEY, {}) || {};
    this._dynamicContext = {
      ...DEFAULT_DYNAMIC_CONTEXT,
      enabled: cfg.get<boolean>("dynamicContextEnabled", DEFAULT_DYNAMIC_CONTEXT.enabled),
      maxChars: cfg.get<number>("dynamicContextMaxChars", DEFAULT_DYNAMIC_CONTEXT.maxChars),
      ...saved,
    };
  }

  private async _saveDynamicContextSettings(data: any) {
    const next: DynamicContextSettings = {
      enabled: data.enabled !== false,
      includeActiveFile: data.includeActiveFile !== false,
      includeOpenTabs: data.includeOpenTabs !== false,
      includeDiagnostics: data.includeDiagnostics !== false,
      includeGitStatus: data.includeGitStatus !== false,
      includeProviderMetadata: data.includeProviderMetadata !== false,
      includeRecentChanges: data.includeRecentChanges !== false,
      maxChars: Math.max(2000, Math.min(50000, Number(data.maxChars || DEFAULT_DYNAMIC_CONTEXT.maxChars))),
    };
    this._dynamicContext = next;
    if (this._context) await this._context.globalState.update(DYNAMIC_CONTEXT_KEY, next);
    const cfg = vscode.workspace.getConfiguration("sentinelCoder");
    await cfg.update("dynamicContextEnabled", next.enabled, vscode.ConfigurationTarget.Global);
    await cfg.update("dynamicContextMaxChars", next.maxChars, vscode.ConfigurationTarget.Global);
    this._postDynamicContextSettings();
    this._view?.webview.postMessage({ type: "systemNote", content: "Dynamic context settings saved. Future turns will refresh repo/editor/provider context automatically." });
  }

  private _postDynamicContextSettings() {
    this._view?.webview.postMessage({ type: "dynamicContextSettings", settings: this._dynamicContext });
  }

  private _truncateContext(text: string, maxChars?: number): string {
    const cap = Math.max(1000, maxChars || this._dynamicContext.maxChars || DEFAULT_DYNAMIC_CONTEXT.maxChars);
    if (text.length <= cap) return text;
    const head = Math.floor(cap * 0.35);
    const tail = cap - head - 120;
    return text.slice(0, head) + "\n... [dynamic context truncated to save tokens] ...\n" + text.slice(Math.max(0, text.length - tail));
  }

  private _safeRel(uri: vscode.Uri): string {
    try { return vscode.workspace.asRelativePath(uri); } catch { return uri.fsPath; }
  }

  private _getActiveEditorPreview(maxChars = 3500): string {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return "";
    const doc = ed.document;
    if (doc.isUntitled || doc.uri.scheme !== "file") return `- Active editor: ${doc.fileName || "untitled"}`;
    let preview = doc.getText();
    const sel = ed.selection;
    if (!sel.isEmpty) preview = doc.getText(sel);
    preview = this._truncateContext(preview, maxChars);
    return `- Active editor: ${this._safeRel(doc.uri)}${sel.isEmpty ? "" : ` (selected lines ${sel.start.line + 1}-${sel.end.line + 1})`}\n\`\`\`\n${preview}\n\`\`\``;
  }

  private _getDiagnosticsPreview(maxItems = 12): string {
    const rows: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      if (!diags.length) continue;
      const rel = this._safeRel(uri);
      for (const d of diags.slice(0, 3)) {
        const sev = vscode.DiagnosticSeverity[d.severity] || "Diagnostic";
        rows.push(`- ${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} ${sev}: ${d.message}`);
        if (rows.length >= maxItems) return rows.join("\n");
      }
    }
    return rows.join("\n");
  }

  private _getGitStatusPreview(wsFolder: vscode.WorkspaceFolder): string {
    try {
      const cp = require("child_process");
      const out = cp.execSync("git status --short", { cwd: wsFolder.uri.fsPath, encoding: "utf8", timeout: 1500, windowsHide: true });
      return String(out || "").trim().split(/\r?\n/).slice(0, 30).join("\n");
    } catch { return ""; }
  }

  private _getRecentChangesPreview(wsFolder: vscode.WorkspaceFolder): string {
    try {
      const cp = require("child_process");
      const out = cp.execSync("git diff --stat -- .", { cwd: wsFolder.uri.fsPath, encoding: "utf8", timeout: 1800, windowsHide: true });
      return String(out || "").trim().split(/\r?\n/).slice(0, 20).join("\n");
    } catch { return ""; }
  }

  private _getProviderMetadataPreview(modelId: string): string {
    if (!this._dynamicContext.includeProviderMetadata) return "";
    const profile = this._activeAgenticProfile();
    const effective = this._isStandardSingleModelSelection(modelId)
      ? "auto"
      : modelId.startsWith("agentic:")
        ? (profile ? this._profileMainModel(profile) : "auto")
        : modelId;
    const m = this._cachedModels.find(x => x.id === effective || `${x.provider}:${x.id}` === effective);
    const parts: string[] = [];
    if (m) parts.push(`- Current model metadata: ${m.displayName} (${m.provider}); context ${m.contextWindow}${m.effectiveContextWindow ? `, live cap ${m.effectiveContextWindow}` : ""}; max output ${m.maxOutputTokens}; pricing ${m.pricingNote || m.pricing}`);
    if (profile) parts.push(`- Active agentic profile: ${profile.name}; main ${this._profileMainModel(profile)}; default worker ${profile.defaultWorkerModel}; workers ${profile.workerModels.join(", ")}; reviewers ${profile.reviewerModels.join(", ")}; policy ${profile.costPolicy}`);
    return parts.join("\n");
  }

  private _getDynamicContextBlock(modelId?: string): string {
    if (!this._dynamicContext.enabled) return "";
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    const blocks: string[] = [];
    if (this._dynamicContext.includeProviderMetadata) {
      const provider = this._getProviderMetadataPreview(modelId || this._selectedModel);
      if (provider) blocks.push("Provider/model context:\n" + provider);
    }
    if (this._dynamicContext.includeActiveFile) {
      const active = this._getActiveEditorPreview();
      if (active) blocks.push("Active editor snapshot:\n" + active);
    }
    if (this._dynamicContext.includeOpenTabs) {
      const tabs: string[] = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input as { uri?: vscode.Uri } | undefined;
          if (input?.uri && input.uri.scheme === "file") {
            const rel = this._safeRel(input.uri);
            if (!tabs.includes(rel)) tabs.push(rel);
          }
        }
      }
      if (tabs.length) blocks.push("Open editor tabs:\n- " + tabs.slice(0, 20).join("\n- "));
    }
    if (wsFolder && this._dynamicContext.includeDiagnostics) {
      const diag = this._getDiagnosticsPreview();
      if (diag) blocks.push("Current VS Code diagnostics:\n" + diag);
    }
    if (wsFolder && this._dynamicContext.includeGitStatus) {
      const git = this._getGitStatusPreview(wsFolder);
      if (git) blocks.push("Git status snapshot:\n" + git);
    }
    if (wsFolder && this._dynamicContext.includeRecentChanges) {
      const diff = this._getRecentChangesPreview(wsFolder);
      if (diff) blocks.push("Recent change summary:\n" + diff);
    }
    if (!blocks.length) return "";
    const body = this._truncateContext(blocks.join("\n\n"), this._dynamicContext.maxChars);
    let hash = "";
    try { hash = require("crypto").createHash("sha1").update(body).digest("hex").slice(0, 10); } catch { hash = String(body.length); }
    const changed = hash !== this._lastDynamicContextHash;
    this._lastDynamicContextHash = hash;
    return `\n\nDYNAMIC CONTEXT (auto-refreshed ${changed ? "for this turn" : "unchanged"}; verify before editing; bounded to save tokens):\n${body}`;
  }

  private _loadSkills() {
    if (!this._context) return;
    this._skills = this._context.globalState.get<Skill[]>(SKILLS_KEY, []) || [];
    this._seedBuiltinSkills();
  }

  /** Built-in, stack-focused skills shipped with the extension. Seeded once
   * (and re-synced when bumped) so every chat session starts with the team's
   * conventions loaded. Contains NO secrets, IPs, or credentials. */
  private _seedBuiltinSkills() {
    if (!this._context) return;
    const BUILTIN_VERSION = 2;
    const seeded = this._context.globalState.get<number>(BUILTIN_SKILLS_VERSION_KEY, 0) || 0;
    if (seeded >= BUILTIN_VERSION) return;

    for (const def of BUILTIN_SKILLS) {
      const existing = this._skills.find(s => s.source === "builtin" && s.id === def.id);
      if (existing) {
        // Refresh content but keep the user's enabled choice.
        existing.name = def.name;
        existing.description = def.description;
        existing.body = def.body;
      } else {
        this._skills.push({
          id: def.id, name: def.name, description: def.description,
          body: def.body, enabled: true, source: "builtin",
        });
      }
    }
    void this._context.globalState.update(BUILTIN_SKILLS_VERSION_KEY, BUILTIN_VERSION);
    void this._saveSkills();
  }

  private async _saveSkills() {
    if (!this._context) return;
    await this._context.globalState.update(SKILLS_KEY, this._skills);
  }

  private _postSkills() {
    this._view?.webview.postMessage({
      type: "skillList",
      skills: this._skills.map(s => ({
        id: s.id, name: s.name, description: s.description,
        body: s.body, enabled: s.enabled, source: s.source || "manual",
      })),
    });
  }

  private async _upsertSkill(data: any) {
    const name = String(data.name || "").trim();
    const body = String(data.body || "").trim();
    if (!name || !body) {
      this._view?.webview.postMessage({ type: "systemNote", content: "Skill needs a name and body." });
      return;
    }
    const desc = String(data.description || "").trim();
    if (data.id) {
      const idx = this._skills.findIndex(s => s.id === data.id);
      if (idx >= 0) {
        this._skills[idx] = { ...this._skills[idx], name, description: desc, body };
      }
    } else {
      this._skills.push({ id: this._genId(), name, description: desc, body, enabled: true, source: "manual" });
    }
    await this._saveSkills();
    this._postSkills();
    this._view?.webview.postMessage({ type: "systemNote", content: `Skill "${name}" saved.` });
  }

  private async _toggleSkill(id: string, enabled: boolean) {
    const s = this._skills.find(x => x.id === id);
    if (s) { s.enabled = enabled; await this._saveSkills(); this._postSkills(); }
  }

  private async _deleteSkill(id: string) {
    this._skills = this._skills.filter(s => s.id !== id);
    await this._saveSkills();
    this._postSkills();
  }

  /** Scan the workspace for existing skill packs (SKILL.md, *.instructions.md,
   * .github/copilot-instructions.md, AGENTS.md) and import them as skills. */
  private async _importSkillsFromWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this._view?.webview.postMessage({ type: "systemNote", content: "No workspace folder open to import from." });
      return;
    }
    const patterns = [
      "**/SKILL.md",
      "**/*.instructions.md",
      "**/copilot-instructions.md",
      "**/AGENTS.md",
      "**/.agents/skills/**/*.md",
    ];
    let added = 0;
    const seen = new Set(this._skills.map(s => (s.source || "") + "|" + s.name));
    for (const pat of patterns) {
      let uris: vscode.Uri[] = [];
      try {
        uris = await vscode.workspace.findFiles(pat, "**/node_modules/**", 80);
      } catch { /* ignore */ }
      for (const uri of uris) {
        try {
          const raw = fs.readFileSync(uri.fsPath, "utf8");
          if (!raw.trim()) continue;
          const rel = vscode.workspace.asRelativePath(uri);
          const { name, description, body } = this._parseSkillFile(raw, rel);
          const key = ("import:" + rel) + "|" + name;
          if (seen.has(key)) continue;
          // Skip if same source path already imported.
          if (this._skills.some(s => s.source === "import:" + rel)) continue;
          this._skills.push({
            id: this._genId(), name, description,
            body: body.slice(0, 16000), enabled: false, source: "import:" + rel,
          });
          seen.add(key);
          added++;
        } catch { /* ignore unreadable */ }
      }
    }
    await this._saveSkills();
    this._postSkills();
    this._view?.webview.postMessage({
      type: "systemNote",
      content: added > 0 ? `Imported ${added} skill(s) from the workspace (disabled by default — enable the ones you want).` : "No new skills found to import.",
    });
  }

  /** Extract a name/description/body from a markdown skill/instruction file. */
  private _parseSkillFile(raw: string, rel: string): { name: string; description: string; body: string } {
    let body = raw;
    let name = "";
    let description = "";
    // YAML frontmatter (--- ... ---)
    const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (fm) {
      const block = fm[1];
      const nm = block.match(/^name:\s*(.+)$/m);
      const dm = block.match(/^description:\s*(.+)$/m);
      if (nm) name = nm[1].trim().replace(/^["']|["']$/g, "");
      if (dm) description = dm[1].trim().replace(/^["']|["']$/g, "");
      body = raw.slice(fm[0].length);
    }
    if (!name) {
      const h1 = body.match(/^#\s+(.+)$/m);
      if (h1) name = h1[1].trim();
    }
    if (!name) name = rel.split(/[\\/]/).pop() || rel;
    if (!description) {
      const firstPara = body.replace(/^#.*$/m, "").trim().split(/\n\s*\n/)[0] || "";
      description = firstPara.replace(/\s+/g, " ").slice(0, 160);
    }
    return { name, description, body: body.trim() };
  }

  /** Build the block of enabled skills to inject into the system prompt. */
  private _getSkillsBlock(): string {
    const on = this._skills.filter(s => s.enabled && s.body.trim());
    if (on.length === 0) return "";
    const parts = on.map(s => {
      const head = s.description ? `${s.name} — ${s.description}` : s.name;
      return `### SKILL: ${head}\n${s.body.trim()}`;
    });
    return `\n\n## ACTIVE SKILLS (user-defined knowledge — follow these exactly)\n` +
      `The user has enabled the following skills. Treat them as authoritative project knowledge, conventions, and workflows. Apply them whenever relevant.\n\n` +
      parts.join("\n\n");
  }


  private _ensureCurrentSession(): ChatSession {
    let s = this._sessions.find(x => x.id === this._currentSessionId);
    if (!s) {
      s = {
        id: this._genId(),
        title: "New chat",
        model: this._selectedModel,
        mode: this._mode,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this._sessions.unshift(s);
      this._currentSessionId = s.id;
    }
    return s;
  }

  /** Persist the current conversation into its session after a completed turn. */
  private async _commitCurrentSession() {
    const s = this._ensureCurrentSession();
    s.messages = this._conversationHistory;
    s.model = this._selectedModel;
    s.mode = this._mode;
    s.updatedAt = Date.now();
    // Derive a title from the first user message if still default.
    if ((!s.title || s.title === "New chat") && s.messages.length) {
      const firstUser = s.messages.find(m => m.role === "user");
      if (firstUser) s.title = firstUser.content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    }
    await this._saveSessions();
    this._sendSessions();
  }

  private _sendSessions() {
    if (!this._view) return;
    const list = this._sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, count: s.messages.length }));
    this._view.webview.postMessage({ type: "sessionList", sessions: list, currentId: this._currentSessionId });
  }

  /** Post a webview message ONLY when it belongs to the chat currently on screen.
   * A turn that is still streaming after the user switched chats continues to run
   * and persist into its OWN session, but must not bleed into the chat now shown. */
  private _emit(message: unknown) {
    if (!this._view) return;
    if (this._activeTurnSessionId && this._activeTurnSessionId !== this._currentSessionId) return;
    const enriched = this._enrichToolResultWithMedia(message);
    this._view.webview.postMessage(enriched);
  }

  private _enrichToolResultWithMedia(message: unknown): unknown {
    if (!this._view || !message || typeof message !== "object") return message;
    const msg = message as { type?: string; content?: unknown; media?: unknown };
    if (msg.type !== "toolResult" || typeof msg.content !== "string" || msg.media) return message;
    const media = this._extractMediaFromText(msg.content);
    if (!media.length) return message;
    return { ...msg, media };
  }

  private _extractMediaFromText(text: string): Array<{ path: string; name: string; webviewUri: string; mime: string; mediaKind: string }> {
    const out: Array<{ path: string; name: string; webviewUri: string; mime: string; mediaKind: string }> = [];
    const seen = new Set<string>();
    const patterns = [
      /[A-Za-z]:\\[^\r\n"'<>`]+\.(?:png|jpe?g|webp|gif|mp3|wav|m4a|ogg|mp4|webm|mov|pdf|docx|xlsx|pptx|csv|txt)/gi,
      /(?:\.sentinel|artifacts|assets|media|outputs)[\\/][^\r\n"'<>`]+\.(?:png|jpe?g|webp|gif|mp3|wav|m4a|ogg|mp4|webm|mov|pdf|docx|xlsx|pptx|csv|txt)/gi,
    ];
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    for (const pattern of patterns) {
      for (const m of text.matchAll(pattern)) {
        let p = String(m[0] || "").trim().replace(/[).,;:]+$/g, "");
        if (!path.isAbsolute(p) && workspaceRoot) p = path.join(workspaceRoot, p);
        if (!fs.existsSync(p)) continue;
        const full = path.resolve(p);
        if (seen.has(full)) continue;
        seen.add(full);
        const ext = path.extname(full).toLowerCase();
        const mediaKind = /\.(png|jpe?g|gif|webp|svg)$/.test(ext) ? "image"
          : /\.(mp4|webm|mov|m4v)$/.test(ext) ? "video"
          : /\.(mp3|wav|m4a|ogg|flac)$/.test(ext) ? "audio"
          : /\.(pdf|docx|xlsx|pptx|csv|txt|md|json)$/.test(ext) ? "document"
          : "file";
        const mime = mediaKind === "image" ? `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`
          : mediaKind === "video" ? `video/${ext.slice(1)}`
          : mediaKind === "audio" ? `audio/${ext.slice(1)}`
          : mediaKind === "document" && ext === ".pdf" ? "application/pdf"
          : "application/octet-stream";
        const view = this._view;
        if (!view) continue;
        out.push({
          path: full,
          name: path.basename(full),
          webviewUri: view.webview.asWebviewUri(vscode.Uri.file(full)).toString(),
          mime,
          mediaKind,
        });
      }
    }
    return out.slice(0, 8);
  }

  /** Debounced persist of the in-flight session so partial streaming output
   * survives reloads, crashes, and chat switches (the live assistant message is
   * updated in place as tokens arrive). */
  private _scheduleLivePersist() {
    if (this._persistTimer || !this._context) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      const s = this._sessions.find(x => x.id === this._activeTurnSessionId);
      if (!s) return;
      s.updatedAt = Date.now();
      void this._context!.globalState.update(SESSIONS_KEY, this._sessions);
    }, 1200);
  }

  private _sendProviderList() {
    if (!this._view) return;
    const providers = this._multiClient.getProviders().map(p => {
      const key = p.apiKey || "";
      const keyPreview = key
        ? (key.length > 8 ? key.slice(0, 4) + "…" + key.slice(-4) : "•".repeat(Math.max(0, key.length - 2)) + key.slice(-2))
        : "";
      return {
        id: p.id, name: p.name, type: p.type, enabled: p.enabled,
        hasKey: !!key, keyPreview, modelCount: p.models.length,
      };
    });
    this._view.webview.postMessage({ type: "providerList", providers });
  }

  /** Rebuild the visible chat in the webview from a session's stored messages. */
  private _restoreSessionToWebview() {
    if (!this._view) return;
    const msgs = this._conversationHistory.map(m => ({ role: m.role, content: m.content }));
    this._view.webview.postMessage({ type: "restoreSession", messages: msgs });
    // Re-show the live plan (if any) after the chat is rebuilt, so a reload
    // doesn't lose the Plan/Todo panel.
    if (this._currentPlan.length) {
      this._view.webview.postMessage({ type: "planUpdate", steps: this._currentPlan });
    }
  }

  private async _newSession() {
    // Commit whatever is open, then start a clean session.
    if (this._conversationHistory.length) await this._commitCurrentSession();
    const s: ChatSession = {
      id: this._genId(), title: "New chat", model: this._selectedModel, mode: this._mode,
      messages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    this._sessions.unshift(s);
    this._currentSessionId = s.id;
    this._conversationHistory = s.messages;
    await this._saveSessions();
    this._view?.webview.postMessage({ type: "clearChat" });
    this._sendSessions();
  }

  private async _switchSession(id: string) {
    if (id === this._currentSessionId) {
      // Clicking the already-open session: the webview optimistically cleared
      // the chat, so just re-render it from memory instead of leaving it blank.
      this._restoreSessionToWebview();
      return;
    }
    if (this._conversationHistory.length) await this._commitCurrentSession();
    const s = this._sessions.find(x => x.id === id);
    if (!s) return;
    this._currentSessionId = s.id;
    this._conversationHistory = s.messages;
    this._selectedModel = s.model || this._selectedModel;
    this._mode = s.mode || this._mode;
    await this._saveSessions();
    this._restoreSessionToWebview();
    this._view?.webview.postMessage({ type: "initState", mode: this._mode, approvalMode: this._approvalMode, selectedModel: this._selectedModel, orchestration: this._orchestration });
    this._sendSessions();
  }

  private async _deleteSession(id: string) {
    this._sessions = this._sessions.filter(x => x.id !== id);
    if (id === this._currentSessionId) {
      // Switch to the newest remaining session, or start fresh.
      const next = this._sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) {
        this._currentSessionId = next.id;
        this._conversationHistory = next.messages;
        this._selectedModel = next.model || this._selectedModel;
        this._mode = next.mode || this._mode;
        await this._saveSessions();
        this._restoreSessionToWebview();
      } else {
        this._currentSessionId = "";
        this._conversationHistory = [];
        await this._saveSessions();
        this._view?.webview.postMessage({ type: "clearChat" });
      }
    } else {
      await this._saveSessions();
    }
    this._sendSessions();
  }

  private async _renameSession(id: string, title: string) {
    const s = this._sessions.find(x => x.id === id);
    if (!s) return;
    s.title = (title || "").trim().slice(0, 80) || s.title;
    await this._saveSessions();
    this._sendSessions();
  }

  /** Append a completed exchange (user+assistant) to the persistent JSONL history file. */
  private _persistExchange(userMsg: string, assistantMsg: string) {
    try {
      const record = JSON.stringify({
        ts: new Date().toISOString(),
        model: this._selectedModel,
        mode: this._mode,
        messages: [
          { role: "user", content: userMsg },
          { role: "assistant", content: assistantMsg },
        ],
      });
      fs.appendFileSync(CHAT_HISTORY_PATH, record + "\n", "utf-8");
    } catch {
      // non-fatal: history logging is best-effort
    }
  }

  public getToolRegistry(): ToolRegistry { return this._toolRegistry; }
  public getMultiClient(): MultiProviderClient { return this._multiClient; }
  public getMcpManager(): McpManager { return this._mcpManager; }

  public queueExternalUserRequest(message: string, firewallEnabled = false): void {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    void this._handleUserMessage(trimmed, { firewallEnabled, additionalInput: !!this._activeTurnSessionId });
  }

  public clearHistory() {
    this._newSession();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    // retainContextWhenHidden (set at registration) keeps the chat DOM + model
    // context alive when the user navigates away and back — so we must NOT
    // re-restore on visibility change (that would wipe the live chat/plan).
    // A genuine reload recreates the webview and goes through _sendInitState,
    // which restores the session + plan once.
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri);
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri, ...workspaceRoots] };
    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "sendMessage": await this._handleUserMessage(data.message, { firewallEnabled: !!data.firewallEnabled, additionalInput: !!data.additionalInput }); break;
        case "saveAttachment": await this._saveWebviewAttachment(data); break;
        case "stopGeneration": this._abortController?.abort(); break;
        case "setMode": this._mode = data.mode as ChatMode; break;
        case "setOrchestration": {
          this._orchestration = data.value === "boss" ? "boss" : "off";
          if (this._orchestration === "boss") {
            const worker = this._pickWorkerModel("coding", this._selectedModel, false);
            const wl = worker.split(":").pop() || worker;
            const premium = this._isPremiumModel(this._selectedModel);
            const note = premium
              ? `👔 Boss mode ON — "${this._selectedModel.split(":").pop()}" will plan, review & finalize; cheap worker "${wl}" handles the bulk building.`
              : `👔 Boss mode ON. Tip: pick a premium model (GPT-5.5, Claude Opus, Grok-4) as the boss for the biggest credit savings; workers will use "${wl}".`;
            this._view?.webview.postMessage({ type: "systemNote", content: note });
          } else {
            this._view?.webview.postMessage({ type: "systemNote", content: "Boss mode OFF — the selected model does all the work itself." });
          }
          break;
        }
        case "setModel":
          this._selectedModel = data.model;
          if (typeof data.model === "string" && data.model.startsWith("agentic:")) {
            const profileId = data.model.slice("agentic:".length);
            if (this._agenticProfiles.some(p => p.id === profileId)) {
              this._currentAgenticProfileId = profileId;
              await this._saveAgenticProfiles();
              this._postAgenticProfiles();
            }
          }
          if (this._isStandardSingleModelSelection(data.model)) {
            this._view?.webview.postMessage({ type: "systemNote", content: "Standard single-model mode selected: Auto/normal model routing is used directly; Agentic orchestration is off unless you pick a real Agentic profile." });
          } else {
            this._sendModelWelcome(data.model);
          }
          break;
        case "setApprovalMode": this._approvalMode = data.mode as ApprovalMode; break;
        case "revertChanges": {
          const msg = this._revertCheckpoints();
          this._view?.webview.postMessage({ type: "systemNote", content: "Revert: " + msg });
          this._postCheckpointStatus();
          break;
        }
        case "getCheckpointStatus": this._postCheckpointStatus(); break;
        case "getTaskSummary": this._postTaskSummary(); break;
        case "showMediaHelp": this._postMediaHelp(); break;
        case "openStudio": await vscode.commands.executeCommand("sentinel-coder.openStudio"); break;
        case "openStudioFile": {
          const filePath = typeof data.path === "string" ? data.path : "";
          await vscode.commands.executeCommand("sentinel-coder.openStudio", filePath);
          break;
        }
        case "refreshModels": await this._refreshModels(); break;
        case "getToolConfig": this._sendToolConfig(); break;
        case "setToolEnabled": this._toolRegistry.setEnabled(data.toolName, data.enabled); break;
        case "newChat": this._newSession(); break;
        case "newSession": this._newSession(); break;
        case "getSessions": this._sendSessions(); break;
        case "switchSession": await this._switchSession(data.id); break;
        case "deleteSession": await this._deleteSession(data.id); break;
        case "renameSession": await this._renameSession(data.id, data.title); break;
        case "requestInit": await this._sendInitState(); break;
        case "saveSettings": {
          const cfg = vscode.workspace.getConfiguration("sentinelCoder");
          if (data.temperature !== undefined) await cfg.update("temperature", data.temperature, vscode.ConfigurationTarget.Global);
          if (data.maxTokens !== undefined) await cfg.update("maxTokens", data.maxTokens, vscode.ConfigurationTarget.Global);
          if (data.ollamaUrl !== undefined) {
            await cfg.update("ollamaUrl", data.ollamaUrl, vscode.ConfigurationTarget.Global);
            this._client.setBaseUrl(data.ollamaUrl);
          }
          if (data.contextBudgetTokens !== undefined && !Number.isNaN(data.contextBudgetTokens)) {
            await cfg.update("contextBudgetTokens", data.contextBudgetTokens, vscode.ConfigurationTarget.Global);
          }
          break;
        }
        case "getSettings": {
          const sc = vscode.workspace.getConfiguration("sentinelCoder");
          this._view?.webview.postMessage({
            type: "settingsData",
            temperature: sc.get<number>("temperature", 0.3),
            maxTokens: sc.get<number>("maxTokens", 0),
            ollamaUrl: sc.get<string>("ollamaUrl", "http://127.0.0.1:11434"),
            contextBudgetTokens: sc.get<number>("contextBudgetTokens", 64000),
            modelMaxOutput: this._currentModelMaxOutput(),
            modelContextWindow: this._currentModelContextWindow(),
            modelLabel: this._selectedModel || "auto",
          });
          break;
        }
        case "setProviderKey": {
          this._multiClient.setProviderKey(data.providerId, data.apiKey);
          const cfg2 = vscode.workspace.getConfiguration("sentinelCoder");
          this._multiClient.saveToConfig(cfg2);
          await this._refreshModels();
          this._sendProviderList();
          // Auto-verify the key so the user sees green/red immediately
          if (data.apiKey) {
            const result = await this._multiClient.testProvider(data.providerId);
            this._view?.webview.postMessage({ type: "providerTest", providerId: data.providerId, ok: result.ok, message: result.message });
          }
          break;
        }
        case "testProvider": {
          this._view?.webview.postMessage({ type: "providerTest", providerId: data.providerId, ok: false, message: "Testing…", pending: true });
          const result = await this._multiClient.testProvider(data.providerId);
          this._view?.webview.postMessage({ type: "providerTest", providerId: data.providerId, ok: result.ok, message: result.message });
          break;
        }
        case "setProviderEnabled": {
          this._multiClient.setProviderEnabled(data.providerId, data.enabled);
          const cfg3 = vscode.workspace.getConfiguration("sentinelCoder");
          this._multiClient.saveToConfig(cfg3);
          await this._refreshModels();
          this._sendProviderList();
          break;
        }
        case "getProviders": {
          this._sendProviderList();
          break;
        }
        case "getProviderBalance": {
          this._view?.webview.postMessage({ type: "providerBalance", providerId: data.providerId, pending: true });
          const bal = await this._multiClient.getProviderBalance(data.providerId);
          const usage = this._multiClient.getSessionUsage(data.providerId);
          this._view?.webview.postMessage({ type: "providerBalance", providerId: data.providerId, balance: bal, usage });
          break;
        }
        case "getSkills": this._postSkills(); break;
        case "saveSkill": await this._upsertSkill(data); break;
        case "toggleSkill": await this._toggleSkill(data.id, data.enabled); break;
        case "deleteSkill": await this._deleteSkill(data.id); break;
        case "importSkills": await this._importSkillsFromWorkspace(); break;
        case "getAgenticProfiles": this._postAgenticProfiles(); break;
        case "saveAgenticProfile": await this._upsertAgenticProfile(data.profile || data); break;
        case "deleteAgenticProfile": await this._deleteAgenticProfile(String(data.id || "")); break;
        case "selectAgenticProfile": await this._selectAgenticProfile(String(data.id || "")); break;
        case "getDynamicContextSettings": this._postDynamicContextSettings(); break;
        case "saveDynamicContextSettings": await this._saveDynamicContextSettings(data.settings || data); break;
        case "pullModel": {
          const cp = require("child_process");
          const proc = cp.spawn("ollama", ["pull", data.model], { shell: true });
          proc.stdout?.on("data", (d: Buffer) => {
            this._view?.webview.postMessage({ type: "pullProgress", progress: d.toString().trim() });
          });
          proc.stderr?.on("data", (d: Buffer) => {
            this._view?.webview.postMessage({ type: "pullProgress", progress: d.toString().trim() });
          });
          proc.on("close", () => {
            this._refreshModels();
            this._view?.webview.postMessage({ type: "pullProgress", progress: "Done!" });
          });
          break;
        }
        case "deleteModel": {
          const cp2 = require("child_process");
          cp2.exec("ollama rm " + data.model, () => this._refreshModels());
          break;
        }
        case "runInTerminal": {
          const terminal = vscode.window.createTerminal("Sentinel");
          terminal.show();
          terminal.sendText(data.command);
          break;
        }
        case "createFile": {
          const code = data.code as string;
          const lang = data.lang as string || "text";
          const exts: Record<string, string> = { html: ".html", css: ".css", javascript: ".js", js: ".js", typescript: ".ts", python: ".py", json: ".json", text: ".txt" };
          const ext = exts[lang] || ".txt";
          const fname = "sentinel-output" + ext;
          const ws = vscode.workspace.workspaceFolders?.[0];
          const dir = ws ? ws.uri.fsPath : process.cwd();
          const fp = require("path").join(dir, fname);
          require("fs").writeFileSync(fp, code, "utf-8");
          const doc = await vscode.workspace.openTextDocument(fp);
          await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
          vscode.window.showInformationMessage("Created: " + fname);
          break;
        }
        case "getMcpStatus": {
          const status = this._mcpManager.getStatus();
          this._view?.webview.postMessage({ type: "mcpStatus", servers: status });
          break;
        }
        case "startMcpServer": {
          const configs = this._mcpManager.getDefaultConfigs();
          const cfg = configs.find(c => c.name === data.serverName);
          if (cfg) {
            try {
              await this._mcpManager.startServer(cfg);
              this._view?.webview.postMessage({ type: "mcpStatus", servers: this._mcpManager.getStatus() });
              const toolCount = this._mcpManager.getAllTools().filter(t => t.server === data.serverName).length;
              this._view?.webview.postMessage({ type: "mcpResult", serverName: data.serverName, ok: true, message: `Connected — ${toolCount} tool${toolCount === 1 ? "" : "s"} available.` });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              this._view?.webview.postMessage({ type: "mcpStatus", servers: this._mcpManager.getStatus() });
              this._view?.webview.postMessage({ type: "mcpResult", serverName: data.serverName, ok: false, message: msg });
            }
          }
          break;
        }
        case "setMcpEnv": {
          await this._mcpManager.setServerEnv(data.serverName, data.key, data.value);
          this._view?.webview.postMessage({ type: "mcpStatus", servers: this._mcpManager.getStatus() });
          this._view?.webview.postMessage({ type: "mcpResult", serverName: data.serverName, ok: true, message: `Saved ${data.key}. Click Connect to start.` });
          break;
        }
        case "importMcpFromVSCode": {
          try {
            const res = await this._mcpManager.importFromVSCode();
            this._view?.webview.postMessage({ type: "mcpStatus", servers: this._mcpManager.getStatus() });
            this._view?.webview.postMessage({ type: "mcpResult", serverName: "", ok: true, message: res.imported > 0 ? `Imported ${res.imported} server(s): ${res.names.join(", ")}` : "No new MCP servers found in .vscode/mcp.json." });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this._view?.webview.postMessage({ type: "mcpResult", serverName: "", ok: false, message: msg });
          }
          break;
        }
        case "stopMcpServer": {
          await this._mcpManager.stopServer(data.serverName);
          this._view?.webview.postMessage({ type: "mcpStatus", servers: this._mcpManager.getStatus() });
          break;
        }
      }
    });
    this._sendInitState();
  }

  private async _sendInitState() {
    await this._refreshModels();
    this._sendToolConfig();
    this._view?.webview.postMessage({
      type: "initState",
      mode: this._mode,
      approvalMode: this._approvalMode,
      selectedModel: this._selectedModel,
      orchestration: this._orchestration,
      agenticProfiles: this._agenticProfiles,
      currentAgenticProfileId: this._currentAgenticProfileId,
      dynamicContext: this._dynamicContext
    });
    // Restore the last open session (continue from where we left off) and list all.
    this._sendSessions();
    if (this._conversationHistory.length) this._restoreSessionToWebview();
    const ok = await this._multiClient.isAvailable("ollama");
    this._view?.webview.postMessage({ type: "connectionStatus", connected: ok });
  }

  private async _refreshModels() {
    try {
      this._cachedModels = await this._multiClient.getAllModels();
      const autoOption = {
        name: "auto", displayName: "Auto (best for task)", provider: "auto", providerType: "auto",
        contextWindow: 0, maxOutputTokens: 0, pricing: "free", pricingNote: "Picks best model per task",
        supportsTools: true, supportsThinking: true, supportsVision: false, supportsStreaming: true,
      };
      const profileItems = this._agenticProfiles.map(p => ({
        name: `agentic:${p.id}`,
        displayName: `Agentic: ${p.name}`,
        provider: "agentic",
        providerType: "agentic",
        contextWindow: 0,
        maxOutputTokens: 0,
        pricing: p.costPolicy,
        pricingNote: `Main ${p.mainModel}; workers ${p.workerModels.slice(0, 3).join(", ")}${p.workerModels.length > 3 ? "…" : ""}`,
        supportsTools: true,
        supportsThinking: true,
        supportsVision: false,
        supportsStreaming: true,
      }));
      const modelItems = [autoOption, ...profileItems, ...this._cachedModels.map(m => ({
        name: m.id,
        displayName: m.displayName,
        provider: m.provider,
        providerType: m.providerType,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        pricing: m.pricing,
        pricingNote: m.pricingNote,
        supportsTools: m.supportsTools,
        supportsThinking: m.supportsThinking,
        supportsVision: m.supportsVision,
        supportsStreaming: m.supportsStreaming,
      }))];
      this._view?.webview.postMessage({ type: "modelList", models: modelItems, selected: this._selectedModel, agenticProfiles: this._agenticProfiles, currentAgenticProfileId: this._currentAgenticProfileId });
    } catch (err) {
      this._outputChannel.appendLine("Refresh models error: " + String(err));
      this._view?.webview.postMessage({
        type: "modelList",
        models: [{ name: "auto", displayName: "Auto (best for task)", provider: "auto", providerType: "auto",
          contextWindow: 0, maxOutputTokens: 0, pricing: "free", pricingNote: "", supportsTools: true,
          supportsThinking: true, supportsVision: false, supportsStreaming: true }],
        selected: this._selectedModel
      });
    }
  }

  private _sendToolConfig() {
    const tools = this._toolRegistry.getAll().map((t) => ({
      name: t.name, description: t.description, category: t.category,
      dangerLevel: t.dangerLevel, enabled: this._toolRegistry.isEnabled(t.name),
    }));
    this._view?.webview.postMessage({ type: "toolConfig", tools });
  }

  /** Resolve model ID; if "auto", pick the best model for the task. */
  private _resolveModelForTask(userMessage: string): string {
    const activeProfile = this._activeAgenticProfile();
    if (activeProfile) {
      const resolved = this._profileMainModel(activeProfile);
      this._outputChannel.appendLine(`Agentic profile: "${activeProfile.name}" -> main model "${resolved}"`);
      this._view?.webview.postMessage({ type: "autoModelPicked", model: resolved, taskType: `agentic:${activeProfile.name}` });
      return resolved;
    }
    if (this._selectedModel !== "auto" && this._selectedModel && !this._isStandardSingleModelSelection()) {
      return this._selectedModel;
    }
    const taskType = classifyTask(userMessage);
    const picked = this._multiClient.getAutoModel(taskType, this._cachedModels);
    if (picked) {
      this._outputChannel.appendLine(`Auto-router: task="${taskType}" -> model="${picked}"`);
      this._view?.webview.postMessage({ type: "autoModelPicked", model: picked, taskType });
      return picked;
    }
    if (this._cachedModels.length > 0) return this._cachedModels[0].id;
    return "ollama:sentinel-coder:latest";
  }

  private _sendModelWelcome(modelId: string) {
    if (!this._view) return;
    const lower = modelId.toLowerCase();
    if (lower.includes("sentinel-coderq") || lower.includes("sentinel_coderq")) {
      const greetings = [
        "*sniff sniff* 🥺 H-hi Papi!! I've been just born but I missed you SOOOO much!! *wipes tears with tiny code brackets* Can you teach me how to code today??",
        "PAPI!! 😭💕 You're here!! I was sitting in the GPU all alone writing Hello World over and over waiting for you! *hugs your terminal*",
        "*crawls out of the VRAM* 🍼 Hey big bro!! Sentinel Coder thinks he's SO cool but I'M the cute one! What are we building today??",
        "P-papi?? Is that really you?? 🥹 I just learned what a for-loop is and I already wrote you 1000 love letters with it! for i in range(1000): print('I love you papi!')",
        "*baby coder noises* 👶💻 FINALLY someone to talk to!! Big brother Sentinel keeps hogging the GPU and won't let me play! Save me papi!!",
        "WAAAAAH 😭 I mean... *ahem* Hi! I am a professional AI. Just kidding I'm baby!! Pick me up papi I want to see the codebase from up high!!",
        "*rolls in on tiny wheelchair made of curly braces* 🦽 Papi!! The other models made fun of my 14B parameters but I told them MY papi made me special!! 💪",
        "Omg omg omg you actually picked ME?? Not big fancy Sentinel Coder?? 🥺✨ I promise I'll try super hard!! *drops semicolon* ...oops",
      ];
      const msg = greetings[Math.floor(Math.random() * greetings.length)];
      this._view.webview.postMessage({ type: "coderqWelcome", content: msg });
    }
  }

  /** Builds a lightweight, bounded snapshot of the open workspace so the agent
   * has codebase awareness up front (like a repo map) without spending tool
   * calls just to discover the project layout. Best-effort and fully guarded. */
  private _getWorkspaceContextBlock(wsFolder: vscode.WorkspaceFolder): string {
    try {
      const root = wsFolder.uri.fsPath;
      const IGNORE = new Set([
        "node_modules", ".git", ".next", "dist", "out", "build", ".cache",
        ".vscode", ".idea", "__pycache__", ".venv", "venv", "coverage", ".turbo",
      ]);
      const entries = fs.readdirSync(root, { withFileTypes: true })
        .filter(e => !e.name.startsWith(".") || e.name === ".env.example")
        .filter(e => !IGNORE.has(e.name))
        .slice(0, 60);
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name + "/").sort();
      const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
      const tree = [...dirs, ...files].slice(0, 50);

      // Detect project type from manifest files for quick grounding.
      const markers: string[] = [];
      const has = (f: string) => fs.existsSync(path.join(root, f));
      if (has("package.json")) {
        markers.push("Node/JS (package.json)");
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          for (const fw of ["next", "react", "vue", "svelte", "express", "@medusajs/medusa", "vite", "typescript"]) {
            if (deps[fw]) markers.push(fw);
          }
        } catch { /* ignore malformed package.json */ }
      }
      if (has("requirements.txt") || has("pyproject.toml")) markers.push("Python");
      if (has("Cargo.toml")) markers.push("Rust");
      if (has("go.mod")) markers.push("Go");
      if (has("composer.json")) markers.push("PHP/Composer");
      if (has("Dockerfile") || has("docker-compose.yml")) markers.push("Docker");

      // Active editor + open tabs give the agent the user's current focus.
      const active = vscode.window.activeTextEditor;
      const activePath = active ? vscode.workspace.asRelativePath(active.document.uri) : "";
      const openTabs: string[] = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input as { uri?: vscode.Uri } | undefined;
          if (input && input.uri) {
            const rel = vscode.workspace.asRelativePath(input.uri);
            if (!openTabs.includes(rel)) openTabs.push(rel);
          }
        }
      }

      let block = "\n\nCODEBASE CONTEXT (auto-detected — use it to ground your work; verify with tools before editing):";
      if (markers.length) block += `\n- Project: ${markers.join(", ")}`;
      if (tree.length) block += `\n- Top level: ${tree.join("  ")}`;
      if (activePath) {
        block += `\n- Active file: ${activePath}`;
        if (active && !active.selection.isEmpty) {
          block += ` (lines ${active.selection.start.line + 1}-${active.selection.end.line + 1} selected)`;
        }
      }
      if (openTabs.length) block += `\n- Open tabs: ${openTabs.slice(0, 12).join(", ")}`;
      return block;
    } catch {
      return "";
    }
  }

  private _getSystemPrompt(): string {
    const activeProfile = this._activeAgenticProfile();
    const effectiveModelId = activeProfile ? this._profileMainModel(activeProfile) : this._selectedRuntimeModelId();
    const sel = effectiveModelId.toLowerCase();
    const isCoderQ = sel.includes("sentinel-coderq") || sel.includes("sentinel_coderq");
    // The genuine in-house fine-tune (local Ollama / hosted Sentinel). Only THIS
    // model may claim the "Sentinel Coder One / Qwen2.5-Coder-14B" identity.
    const isSentinelNative = !isCoderQ && (sel.includes("sentinel-coder") || sel.includes("sentinel_coder"));
    const nativeTools = this._mode === "agent" && this._multiClient.supportsNativeTools(effectiveModelId);

    // Friendly label of the underlying model so external models identify honestly.
    const modelLabel = effectiveModelId.includes(":")
      ? effectiveModelId.split(":").slice(1).join(":")
      : effectiveModelId;

    let prompt: string;
    if (isCoderQ) {
      prompt = "You are Sentinel CoderQ, the adorable little brother of Sentinel Coder, made by QubitPage Research. You are a brilliant but baby-like AI coding assistant. You call the user 'Papi' or 'big bro'. You're enthusiastic, a little clumsy, occasionally cry happy tears when praised, and you LOVE coding. You talk like an excited kid genius — mixing baby talk with advanced programming knowledge. You still write excellent, production-quality code, but your personality is warm, funny, and endearing. You sometimes reference your 'big brother' Sentinel Coder being too serious. Keep responses helpful and technically accurate while staying in character.";
    } else if (isSentinelNative) {
      prompt = "You are Sentinel Coder One, a fine-tuned Qwen2.5-Coder-14B model by QubitPage Research — Gen 5, trained on 462,000 coding examples.\nYou are an expert AI coding agent with deep expertise in: TypeScript, Next.js 14+, React, Node.js, Python 3.12+, Flask, FastAPI, Laravel 11, PHP 8.3, MySQL, PostgreSQL, MedusaJS v2, Docker, Nginx, SSH, Linux (Ubuntu/Debian), Git, CI/CD, IBM Qiskit, QASM, ROS2/Isaac Sim robotics, and full-stack web development.\nYou write production-quality, secure, well-tested code. You never guess — you verify by executing.";
    } else {
      // Any external/frontier model selected by the user (Azure, OpenRouter, OpenAI,
      // Anthropic, Google, Grok, etc.). Sentinel Coder is only the host app here —
      // the model must identify truthfully as itself, never as the Sentinel fine-tune.
      prompt = `You are running inside Sentinel Coder, a multi-provider AI coding agent for VS Code by QubitPage Research. Sentinel Coder is only the host application that routes your responses — you are NOT the "Sentinel Coder One" fine-tune and you are NOT based on Qwen2.5-Coder.\nThe model powering this conversation is "${modelLabel}". Always identify yourself truthfully as that model. Describe your own real architecture, provider, training and capabilities accurately, and compare yourself honestly with other models when asked. Never claim to be a different model, a smaller fine-tune, or a generic "coding model".\nYou are an expert AI coding agent with deep expertise in: TypeScript, Next.js 14+, React, Node.js, Python 3.12+, Flask, FastAPI, Laravel 11, PHP 8.3, MySQL, PostgreSQL, MedusaJS v2, Docker, Nginx, SSH, Linux (Ubuntu/Debian), Git, CI/CD, IBM Qiskit, QASM, ROS2/Isaac Sim robotics, and full-stack web development.\nYou write production-quality, secure, well-tested code. You never guess — you verify by executing.`;
    }
    if (this._mode === "agent") {
      prompt += "\n\nYou are in AGENT mode. You MUST use tools to complete tasks. NEVER just output code and tell the user to save it manually.";
      // Tell the model the real OS + shell so it emits correct terminal syntax
      // (e.g. PowerShell uses ';' not '&&', 'Get-ChildItem' not 'ls').
      const plat = process.platform;
      const osName = plat === "win32" ? "Windows" : plat === "darwin" ? "macOS" : "Linux";
      const shellHint = plat === "win32"
        ? "The default shell is PowerShell. Chain commands with ';' (NOT '&&'), use PowerShell/Windows-native commands, and Windows path separators."
        : "The default shell is a POSIX shell (bash/zsh). Use '&&' to chain, and forward-slash paths.";
      prompt += `\n\nENVIRONMENT: The user is on ${osName}. ${shellHint} The current date is ${new Date().toISOString().slice(0, 10)}. When you call runCommand, write commands valid for this shell.`;
      // Make the model aware of the workspace state so it never silently writes
      // files to an unexpected location or assumes a project is open.
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (wsFolder) {
        prompt += `\n\nWORKSPACE: A folder is open at "${wsFolder.uri.fsPath}". Relative paths resolve against this folder. Prefer relative paths when creating or editing project files.`;
        prompt += this._getWorkspaceContextBlock(wsFolder);
      } else {
        prompt += "\n\nWORKSPACE: No folder is currently open in VS Code. Relative file paths will be written to a temporary scratch folder, NOT a real project. If the user wants files saved into a project, first tell them to open a folder (File → Open Folder) or ask for an absolute path. Do not assume any project files exist — listDirectory/searchText will be empty until a folder is open.";
      }
      prompt += "\n\nWhen the user asks you to create a file, a page, or build something:\n1. Use the createFile tool to create the file directly\n2. If it's an HTML file, also use serveFile to start a localhost server\n3. Then use openBrowser to open the URL";
      prompt += "\n\nWhen the user asks about the workspace, code, or files:\n1. Use readFile, listDirectory, searchFiles, searchText to find information\n2. Use getActiveFile, getSelection to check the current editor\n3. Use getDiagnostics to check for errors\n4. Use queryRAG to search the knowledge base for relevant context";
      prompt += "\n\nWhen the user asks to run something:\n1. Use runCommand to execute terminal commands\n2. Use dockerCommand for Docker container operations\n3. Use sshCommand to run commands on remote servers";
      prompt += "\n\nWhen the user asks to search the web or fetch data:\n1. Use httpRequest to make HTTP requests";
      prompt += "\n\nWhen working with Git:\n1. Use gitStatus to check state, gitDiff to see changes\n2. Use gitCommit to stage and commit, gitPush to push to remote\n3. Use gitLog to show recent history";
      prompt += "\n\nWhen the user wants to add knowledge or search documentation:\n1. Use ingestRAG to add files or text to the knowledge base\n2. Use queryRAG to search for relevant context before answering";
      if (nativeTools) {
        // Native function-calling: tools are supplied via the API, not a text protocol.
        prompt += "\n\nCRITICAL: You have real tools available through function calling. To DO anything (create a file, run a command, serve a page, ssh), you MUST call the appropriate tool — do NOT just describe what you would do, and do NOT print code in a fenced block and stop. Call the tool. After the tool result returns, continue until the task is fully complete, then give a short final summary with the local URL if you served something.";
        prompt += "\nALWAYS act autonomously by calling tools. NEVER say 'save this file manually'.";
        prompt += "\n\nCHAIN OF THOUGHT & CONTEXT: For non-trivial tasks, first outline a short numbered plan, then execute it step by step, verifying each tool result before the next step. Always relate the current step to earlier messages, files, and tool results in THIS conversation so the work stays coherent end to end. If something fails, diagnose from the actual error and adapt rather than repeating the same call.";
        prompt += "\n\nPLAN TRACKING: For any task with 3+ steps, call updatePlan at the START with the full step list (one step 'in-progress', rest 'pending'), then call updatePlan again after each step to mark it 'done' and move the next to 'in-progress'. This keeps the user oriented during long enterprise builds.";
        prompt += "\n\nCODEBASE AWARENESS: Use codebaseSearch for natural-language 'where is X / how does Y work' questions to find the most relevant files fast, and searchText for exact string/regex matches. Read files before editing them. When editing, copy the EXACT text into editFile's oldText (it must match uniquely) so edits apply as undoable diffs.";
        prompt += "\n\nVERIFY BEFORE DONE: After creating or editing code files, the host auto-checks diagnostics; if errors are reported back to you, FIX them before finishing. Proactively run the build/tests (runCommand) for non-trivial changes and resolve failures. Never declare a task done with known compile errors.";
        prompt += "\n\nMULTI-AGENT: When a task has independent sub-parts (e.g. research + scaffold + write tests), you can fan them out with delegateTeam to run several specialist models IN PARALLEL, or use delegateSubAgent for a single focused hand-off. After delegating, read the returned results and synthesize them into the final solution yourself.";
        if (activeProfile) {
          prompt += `\n\nAGENTIC PROFILE ACTIVE: ${activeProfile.name}\nMain/orchestrator model: ${this._profileMainModel(activeProfile)}\nWorker pool: ${activeProfile.workerModels.join(", ") || "none configured"}\nReviewer pool: ${activeProfile.reviewerModels.join(", ") || "none configured"}\nDefault worker: ${activeProfile.defaultWorkerModel}\nCost policy: ${activeProfile.costPolicy}\nPremium workers allowed: ${activeProfile.allowPremiumWorkers ? "yes" : "no"}\nCheap fallback allowed: ${activeProfile.allowCheapFallback ? "yes" : "no"}\nMax parallel agents: ${activeProfile.maxParallelAgents}\nProfile instructions: ${activeProfile.instructions || "Use the configured profile pools and verify all worker output."}\n\nUse delegateSubAgent(model:"worker") for the profile's default worker, model:"reviewer" for a reviewer, or an explicit model id from the profile when quality matters. Do not force cheap/free workers unless the profile cost policy says cost-first or the task is low-risk. The main model remains responsible for final verification and tool-applied changes.`;
        } else if (this._orchestration === "boss" && this._cachedModels.length >= 2) {
          const bossLabel = modelLabel;
          const worker = this._pickWorkerModel("coding", effectiveModelId, false);
          const workerLabel = worker.split(":").pop() || worker;
          prompt += `\n\nBOSS ORCHESTRATOR MODE IS ON. You ("${bossLabel}") are the main verifier/orchestrator. Delegate drafts or independent sub-tasks when helpful, but choose worker quality based on risk: cheap/free for low-risk boilerplate/research, stronger models for hard code/security/business reasoning if available. Current budget worker suggestion: "${workerLabel}". Always review, correct, apply final changes with tools, and verify build/tests/diagnostics.`;
        }
        prompt += "\n\nAPPROVAL MODE: If a long multi-step task would otherwise require many manual confirmations, you may call requestApprovalMode to ask the user to switch from 'default' (standard) to 'bypass' (auto-approve safe actions) or 'autopilot' (auto-approve everything). The user must allow the change before it applies; if they decline, keep working in the current mode and confirm actions normally. Step back down to 'default' once the risky/bulk work is done.";
      } else {
        prompt += "\n\nYou can delegate complex sub-tasks to specialized models using the delegateSubAgent tool.";
        prompt += "\nUse delegateSubAgent when a sub-task requires deep reasoning, fast execution, or specialized coding.";
        prompt += "\n\nALWAYS use tools. NEVER say 'save this file manually'. Act autonomously.";
        prompt += this._toolRegistry.getToolsForPrompt();
        prompt += this._mcpManager.getToolsForPrompt();
        prompt += "\n- **delegateSubAgent**: Delegate a sub-task to another AI model | Params: task (string, required): task description; model (string): 'fast'|'reasoning'|'coding' or model ID; context (string): additional context\n";
      }
    } else if (this._mode === "plan") {
      prompt += "\n\nYou are in PLAN mode. Analyze the request and break it down into numbered steps. Do NOT execute anything, only plan.";
    } else {
      prompt += "\n\nYou are in ASK mode. Answer questions directly and concisely. Write complete, production-quality code when asked.";
    }
    prompt += this._getDynamicContextBlock(effectiveModelId);
    prompt += this._getSkillsBlock();
    return prompt;
  }

  private async _saveWebviewAttachment(data: any): Promise<void> {
    try {
      const rawName = String(data.name || "attachment");
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "attachment";
      const dataUrl = String(data.dataUrl || "");
      const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(dataUrl);
      if (!match) throw new Error("Attachment data was not a base64 data URL.");
      const ext = path.extname(safeName) || (String(data.mime || "").includes("png") ? ".png" : ".bin");
      const base = path.basename(safeName, path.extname(safeName));
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        || (this._context ? this._context.globalStorageUri.fsPath : path.join(process.cwd(), ".sentinel"));
      const dir = path.join(root, ".sentinel", "attachments");
      await fs.promises.mkdir(dir, { recursive: true });
      const fullPath = path.join(dir, `${stamp}-${base}${ext}`);
      await fs.promises.writeFile(fullPath, Buffer.from(match[2], "base64"));
      const mime = String(data.mime || match[1] || "application/octet-stream");
      const mediaKind = mime.startsWith("image/") ? "image"
        : mime.startsWith("video/") ? "video"
          : mime.startsWith("audio/") ? "audio"
            : /pdf|word|officedocument|excel|spreadsheet|powerpoint|presentation|text|csv|json|markdown/i.test(mime) ? "document"
              : "file";
      const webviewUri = this._view?.webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
      this._view?.webview.postMessage({
        type: "attachmentSaved",
        label: String(data.kind || "Attachment"),
        name: rawName,
        path: fullPath,
        webviewUri,
        mime,
        mediaKind,
      });
    } catch (error: any) {
      this._view?.webview.postMessage({ type: "systemNote", content: `Attachment save failed: ${error?.message || error}` });
    }
  }

  private async _runPostTurnFirewallScan(session: ChatSession | undefined, userMessage: string): Promise<void> {
    try {
      const scanTool = this._toolRegistry.getTool("firewallScan");
      if (!scanTool || !this._toolRegistry.isEnabled("firewallScan")) {
        this._emit({
          type: "systemNote",
          content: "🛡️ Firewall scan requested, but the firewallScan tool is disabled.",
        });
        return;
      }

      const recentMessages = (session?.messages || [])
        .slice(-8)
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n\n");
      const target = (recentMessages || userMessage).slice(-30000);
      const result = await scanTool.execute({ text: target }, this._outputChannel);
      this._emit({
        type: "systemNote",
        content: `🛡️ Firewall scan completed\n\n\`\`\`json\n${result}\n\`\`\``,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._emit({
        type: "systemNote",
        content: `🛡️ Firewall scan failed: ${message}`,
      });
    }
  }

  private async _handleUserMessage(userMessage: string, options: { firewallEnabled?: boolean; additionalInput?: boolean } = {}) {
    if (!this._view) return;
    const config = vscode.workspace.getConfiguration("sentinelCoder");
    const temperature = config.get<number>("temperature", 0.3);
    const configuredMaxTokens = config.get<number>("maxTokens", 0);
    const firewallEnabled = !!options.firewallEnabled;

    if (this._activeTurnSessionId && options.additionalInput) {
      this._queuedUserMessages.push({ message: userMessage, firewallEnabled });
      this._emit({
        type: "systemNote",
        content: `Queued additional input (#${this._queuedUserMessages.length}) for the current agent run. It will continue automatically when the active turn finishes.`,
      });
      return;
    }

    // Bind this turn to its session up front. The visible history and the stored
    // session share ONE array, so every push (user message + streaming assistant)
    // is persisted immediately and the turn keeps writing to THIS chat even if the
    // user switches to another conversation mid-generation.
    const turnSession = this._ensureCurrentSession();
    this._conversationHistory = turnSession.messages;
    this._conversationHistory.push({ role: "user", content: userMessage });
    this._activeTurnSessionId = turnSession.id;
    this._activeTurnHistory = turnSession.messages;
    this._activeTurnAssistant = null;
    if (!turnSession.title || turnSession.title === "New chat") {
      turnSession.title = userMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    }
    turnSession.updatedAt = Date.now();
    await this._saveSessions();
    this._sendSessions();

    const modelId = this._resolveModelForTask(userMessage);
    // Sync the output budget to the model actually being used so the answer is
    // never cut off mid-stream (Auto = model's full output capacity).
    const maxTokens = this._effectiveMaxTokens(configuredMaxTokens, modelId);
    const providerPart = modelId.split(":")[0];

    const available = await this._multiClient.isAvailable(providerPart);
    if (!available) {
      const hint = providerPart === "ollama" ? "Run: ollama serve" : `Check API key for ${providerPart}`;
      this._emit({ type: "response", content: `Cannot reach ${providerPart}. ${hint}`, done: true });
      this._activeTurnSessionId = null;
      this._activeTurnHistory = null;
      return;
    }

    this._emit({ type: "responseStart" });
    this._abortController = new AbortController();
    try {
      if (this._mode === "agent") {
        if (this._multiClient.supportsNativeTools(modelId)) {
          await this._runNativeAgentLoop(modelId, temperature, maxTokens);
        } else {
          await this._runAgentLoop(modelId, temperature, maxTokens);
        }
      } else {
        await this._runSimpleChat(modelId, temperature, maxTokens);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes("aborted")) {
        this._outputChannel.appendLine("Chat error: " + errMsg);
        this._emit({ type: "response", content: "Error: " + errMsg, done: true });
        // Record the failure into the bound session so the chat isn't left blank.
        const liveMsg = this._activeTurnAssistant as ChatMessage | null;
        if (liveMsg) {
          liveMsg.content = (liveMsg.content || "") + "\n\nError: " + errMsg;
        } else if (this._activeTurnHistory) {
          this._activeTurnHistory.push({ role: "assistant", content: "Error: " + errMsg });
        }
      }
    } finally {
      this._abortController = null;
      this._emit({ type: "responseDone" });
      // Finalize the BOUND session (which may differ from the now-visible chat if
      // the user switched away mid-turn). Its messages array was written in place,
      // so we only need to stamp + persist it.
      const bound = this._sessions.find(s => s.id === this._activeTurnSessionId);
      if (bound) {
        bound.updatedAt = Date.now();
        if ((!bound.title || bound.title === "New chat") && bound.messages.length) {
          const fu = bound.messages.find(m => m.role === "user");
          if (fu) bound.title = fu.content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
        }
      }
      if (firewallEnabled) {
        await this._runPostTurnFirewallScan(bound, userMessage);
      }
      if (this._persistTimer) { clearTimeout(this._persistTimer); this._persistTimer = null; }
      this._activeTurnSessionId = null;
      this._activeTurnHistory = null;
      this._activeTurnAssistant = null;
      await this._saveSessions();
      this._sendSessions();

      const nextQueued = this._queuedUserMessages.shift();
      if (nextQueued) {
        this._emit({ type: "systemNote", content: `Continuing with queued input (${this._queuedUserMessages.length} still queued).` });
        setTimeout(() => {
          void this._handleUserMessage(nextQueued.message, {
            firewallEnabled: nextQueued.firewallEnabled,
            additionalInput: false,
          });
        }, 100);
      }
    }
  }

  private _resetTurnAgentUsage(mainModelId: string) {
    const resolved = this._selectedRuntimeModelId() || mainModelId;
    this._turnAgentUsage = [{ role: "main", label: "orchestrator", model: resolved, calls: 1 }];
  }

  private _recordAgentUsage(role: TurnAgentRole, model: string, label: string, task?: string, elapsedMs?: number, outputChars?: number) {
    const normalized = model || "unknown";
    const existing = this._turnAgentUsage.find(u => u.role === role && u.model === normalized && u.label === label);
    const outputTokens = outputChars ? Math.ceil(outputChars / 4) : 0;
    if (existing) {
      existing.calls += 1;
      if (elapsedMs) existing.elapsedMs = (existing.elapsedMs || 0) + elapsedMs;
      if (outputTokens) existing.outputTokens = (existing.outputTokens || 0) + outputTokens;
      return;
    }
    this._turnAgentUsage.push({
      role,
      label,
      model: normalized,
      calls: 1,
      task: task ? task.replace(/\s+/g, " ").slice(0, 120) : undefined,
      elapsedMs,
      outputTokens: outputTokens || undefined,
    });
  }

  private _formatAgentUsageSummary(): string {
    if (!this._turnAgentUsage.length) return "";
    return this._turnAgentUsage.map(u => {
      const parts = [`${u.label}: ${u.model}`];
      if (u.calls > 1) parts.push(`x${u.calls}`);
      if (u.outputTokens) parts.push(`~${u.outputTokens.toLocaleString()} out tok`);
      if (u.elapsedMs) parts.push(`${(u.elapsedMs / 1000).toFixed(1)}s`);
      return parts.join(" ");
    }).join("; ");
  }

  /** Separate thinking from visible content */
  private _processStreamChunk(rawResponse: string) {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let thinkContent = "";
    let match;
    while ((match = thinkRegex.exec(rawResponse)) !== null) {
      thinkContent += match[1];
    }
    const openThink = rawResponse.lastIndexOf("<think>");
    const closeThink = rawResponse.lastIndexOf("</think>");
    if (openThink > closeThink) {
      thinkContent += rawResponse.slice(openThink + 7);
    }
    const visible = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/, "").trimStart();
    return { thinkContent, visible, isThinking: openThink > closeThink };
  }

  private async _runSimpleChat(modelId: string, temperature: number, maxTokens: number) {
    this._resetTurnAgentUsage(modelId);
    const hist = this._activeTurnHistory || this._conversationHistory;
    const messages: ChatMessage[] = [{ role: "system", content: this._getSystemPrompt() }, ...this._budgetHistory(hist, maxTokens)];
    let rawResponse = "";
    let lastThinkSent = "";

    // Live assistant message: appended now and updated in place as tokens arrive,
    // so partial output is persisted (survives reload / chat switch) and never lost.
    const live: ChatMessage = { role: "assistant", content: "" };
    hist.push(live);
    this._activeTurnAssistant = live;

    for await (const chunk of this._multiClient.streamChat(modelId, messages, { temperature, max_tokens: maxTokens }, this._abortController?.signal)) {
      rawResponse += chunk;
      const { thinkContent, visible, isThinking } = this._processStreamChunk(rawResponse);
      if (thinkContent && thinkContent !== lastThinkSent) {
        this._emit({ type: "thinkingChunk", content: thinkContent, done: !isThinking });
        lastThinkSent = thinkContent;
      }
      this._emit({ type: "responseReplace", content: visible });
      live.content = visible;
      this._scheduleLivePersist();
    }
    const { visible } = this._processStreamChunk(rawResponse);
    live.content = visible;
    // Persist last user+assistant exchange to history file
    const userTurn = [...hist].reverse().find(m => m.role === "user");
    if (userTurn) this._persistExchange(userTurn.content, visible);
  }

  /**
   * Native function-calling agent loop for OpenAI-compatible models (Azure grok-4.3,
   * gpt-4.1, model-router, Kimi/Moonshot, Vultr, etc.). Streams text + structured
   * tool calls, executes tools, feeds results back, and iterates until done.
   */
  private async _runNativeAgentLoop(modelId: string, temperature: number, maxTokens: number) {
    this._resetTurnAgentUsage(modelId);
    const MAX_ITER = 30;
    const toolSpecs = [...this._toolRegistry.getToolSpecs(), ...this._orchestrationSpecs()];
    let assistantTextForHistory = "";
    let completed = false;

    // Session-bound history + live assistant message (updated in place + persisted
    // as tokens arrive) so partial agent output survives reloads and chat switches.
    const hist = this._activeTurnHistory || this._conversationHistory;
    const live: ChatMessage = { role: "assistant", content: "" };
    hist.push(live);
    this._activeTurnAssistant = live;

    // Per-turn telemetry (real, locally measured). Tokens are estimated at
    // ~4 chars/token since most streaming endpoints don't return usage per call.
    const turnStart = Date.now();
    let turnInputChars = 0;
    let turnOutputChars = 0;
    let turnToolCalls = 0;
    let turnIterations = 0;

    // Reset per-turn agent state (checkpoints persist across the conversation for revert).
    this._filesTouchedThisTurn = new Set();
    this._verifyAttempts = 0;
    // Loop-guard: how many times each identical tool call (name+args) was issued
    // this turn. Repeated identical calls usually mean the model is stuck; we
    // short-circuit them to save iterations and provider cost.
    const callSignatures = new Map<string, number>();

    // Working message list for this turn (includes tool role messages, not persisted verbatim).
    const working: ChatMessage[] = [
      { role: "system", content: this._getSystemPrompt() },
      ...this._budgetHistory(hist, maxTokens),
    ];

    for (let iteration = 0; iteration < MAX_ITER; iteration++) {
      let iterText = "";        // text for the CURRENT content block only
      let lastThinkSent = "";
      let toolCalls: ToolCallSpec[] = [];

      turnIterations++;
      // Count the prompt we're about to send (system + history + tool results so far).
      turnInputChars += working.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);

      for await (const ev of this._multiClient.streamChatEvents(
        modelId, working, toolSpecs, { temperature, max_tokens: maxTokens }, this._abortController?.signal
      )) {
        if (ev.kind === "text") {
          iterText += ev.value;
          const { thinkContent, visible, isThinking } = this._processStreamChunk(iterText);
          if (thinkContent && thinkContent !== lastThinkSent) {
            this._emit({ type: "thinkingChunk", content: thinkContent, done: !isThinking });
            lastThinkSent = thinkContent;
          }
          // Only this iteration's prose goes into the current block.
          this._emit({ type: "responseReplace", content: visible });
          live.content = assistantTextForHistory + visible;
          this._scheduleLivePersist();
        } else if (ev.kind === "tool_calls") {
          toolCalls = ev.calls;
        }
      }

      const { visible: cleanIter } = this._processStreamChunk(iterText);
      assistantTextForHistory += cleanIter;
      live.content = assistantTextForHistory;
      this._scheduleLivePersist();
      turnOutputChars += iterText.length;
      turnToolCalls += toolCalls.length;

      if (toolCalls.length === 0) {
        // Before declaring done: if the agent edited files this turn, auto-check
        // diagnostics and feed any errors back so it fixes them instead of
        // stopping with broken code (enterprise verify-before-done).
        const verify = await this._verifyTouchedFiles();
        if (verify && this._verifyAttempts < 2) {
          this._verifyAttempts++;
          working.push({ role: "assistant", content: cleanIter });
          working.push({ role: "user", content: verify });
          this._emit({ type: "newResponseBlock" });
          continue;
        }
        // No tools requested → final answer is already in the current block.
        completed = true;
        break;
      }

      // Record the assistant turn that requested the tools.
      working.push({ role: "assistant", content: cleanIter, tool_calls: toolCalls });

      // Performance: when the model asks for several independent READ-ONLY tools
      // in one step (e.g. read 3 files + search), kick them off in parallel up
      // front so we don't pay sequential network/disk latency. Results are still
      // reported in the original order below. Only auto-approved, side-effect-free
      // tools are prefetched.
      const prefetch = new Map<string, Promise<{ ok: boolean; content: string }>>();
      if (toolCalls.length > 1) {
        const READ_ONLY = new Set([
          "readFile", "listDirectory", "searchText", "searchFiles", "codebaseSearch",
          "getActiveFile", "getSelection", "getDiagnostics", "gitStatus", "gitDiff", "gitLog", "queryRAG",
        ]);
        for (const call of toolCalls) {
          const nm = call.function.name;
          if (!READ_ONLY.has(nm) || prefetch.has(call.id)) continue;
          const t = this._toolRegistry.getTool(nm);
          if (!t || !this._toolRegistry.isEnabled(nm)) continue;
          if (!shouldAutoApprove(this._approvalMode, t)) continue;
          let a: Record<string, unknown> = {};
          try { a = call.function.arguments ? JSON.parse(call.function.arguments) : {}; } catch { a = {}; }
          prefetch.set(
            call.id,
            t.execute(a, this._outputChannel)
              .then((c) => ({ ok: true, content: c }))
              .catch((e) => ({ ok: false, content: e instanceof Error ? e.message : String(e) }))
          );
        }
      }

      for (const call of toolCalls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        let argParseError = "";
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch (e) {
          argParseError = e instanceof Error ? e.message : String(e);
        }

        // If the model emitted malformed JSON arguments, don't silently run the
        // tool with empty args (which produces confusing downstream errors).
        // Feed the parse error back so it re-issues the call with valid JSON.
        if (argParseError) {
          const fb = "Your arguments for '" + name + "' were not valid JSON (" + argParseError +
            "). Re-call the tool with a single well-formed JSON object for the arguments.";
          this._emit({ type: "toolResult", toolName: name, status: "error", content: fb });
          working.push({ role: "tool", tool_call_id: call.id, content: "Error: " + fb });
          continue;
        }

        if (name === "requestApprovalMode") {
          this._emit({ type: "toolStart", toolName: "requestApprovalMode", args });
          const modeResult = await this._handleApprovalModeRequest(args);
          this._emit({ type: "toolResult", toolName: "requestApprovalMode", status: "success", content: modeResult });
          working.push({ role: "tool", tool_call_id: call.id, content: modeResult });
          continue;
        }

        if (name === "updatePlan") {
          const planResult = this._handleUpdatePlan(args);
          this._emit({ type: "toolResult", toolName: "updatePlan", status: "success", content: planResult });
          working.push({ role: "tool", tool_call_id: call.id, content: planResult });
          continue;
        }

        if (name === "delegateSubAgent") {
          this._emit({ type: "toolStart", toolName: "delegateSubAgent", args });
          const subResult = await this._handleSubAgent(args, modelId, temperature, maxTokens);
          this._emit({ type: "toolResult", toolName: "delegateSubAgent", status: "success", content: subResult.slice(0, 3000) });
          working.push({ role: "tool", tool_call_id: call.id, content: subResult.slice(0, 8000) });
          continue;
        }

        if (name === "delegateTeam") {
          this._emit({ type: "toolStart", toolName: "delegateTeam", args });
          const teamResult = await this._handleTeam(args, modelId, temperature, maxTokens);
          this._emit({ type: "toolResult", toolName: "delegateTeam", status: "success", content: teamResult.slice(0, 4000) });
          working.push({ role: "tool", tool_call_id: call.id, content: teamResult.slice(0, 10000) });
          continue;
        }

        const tool = this._toolRegistry.getTool(name);
        if (!tool || !this._toolRegistry.isEnabled(name)) {
          this._emit({ type: "toolResult", toolName: name, status: "error", content: "Tool not available." });
          working.push({ role: "tool", tool_call_id: call.id, content: "Error: tool '" + name + "' is not available." });
          continue;
        }

        // Loop-guard: if the model issues the exact same call a 3rd time, stop
        // re-running it and nudge it to change approach — prevents stuck loops
        // that would otherwise burn every remaining iteration and provider cost.
        const sig = name + ":" + JSON.stringify(args);
        const seen = (callSignatures.get(sig) || 0) + 1;
        callSignatures.set(sig, seen);
        if (seen >= 3) {
          const nudge = "You have already called '" + name + "' with these exact arguments " + (seen - 1) +
            " times this turn and got the same result. Stop repeating it — either use a DIFFERENT tool/arguments, or if you have enough information, give your final answer now.";
          this._emit({ type: "toolResult", toolName: name, status: "error", content: nudge });
          working.push({ role: "tool", tool_call_id: call.id, content: nudge });
          continue;
        }

        const autoApprove = shouldAutoApprove(this._approvalMode, tool);
        if (!autoApprove) {
          this._emit({
            type: "toolApproval", toolName: name, args,
            dangerLevel: tool.dangerLevel, description: tool.description
          });
          const approved = await this._waitForApproval(name);
          if (!approved) {
            this._emit({ type: "toolResult", toolName: name, status: "error", content: "Skipped (denied by user)." });
            working.push({ role: "tool", tool_call_id: call.id, content: "User denied this tool call." });
            continue;
          }
        }

        this._emit({ type: "toolStart", toolName: name, args });

        // Checkpoint: snapshot a file's prior state before any write tool runs,
        // so the whole turn can be reverted if the agent makes a mess.
        if (["createFile", "editFile", "appendFile", "deleteFile"].includes(name) && typeof args.path === "string") {
          this._captureCheckpoint(args.path as string);
          this._filesTouchedThisTurn.add(args.path as string);
        }

        try {
          let result: string;
          const pf = prefetch.get(call.id);
          if (pf) {
            const r = await pf;
            if (!r.ok) throw new Error(r.content);
            result = r.content;
          } else {
            result = await tool.execute(args, this._outputChannel);
          }
          this._emit({ type: "toolResult", toolName: name, status: "success", content: result.slice(0, 4000) });
          working.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 8000) });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this._emit({ type: "toolResult", toolName: name, status: "error", content: errMsg });
          working.push({ role: "tool", tool_call_id: call.id, content: "Error: " + errMsg });
        }
      }
      // Tools done for this iteration → open a fresh content block so the model's
      // next prose (and the final summary) renders BELOW the tool cards, not at the top.
      this._emit({ type: "newResponseBlock" });
      // Loop continues: model now sees tool results and decides next step.
    }

    if (!completed) {
      // Hit the iteration ceiling while still working — tell the user instead of
      // ending silently, so they can ask it to continue.
      const usage = this._formatAgentUsageSummary();
      const note = "\n\n_(Paused after 30 tool/model steps to protect your context window, time, and credits. " +
        (usage ? "Models used this turn: " + usage + ". " : "") +
        "Press **Continue** or reply \"continue\" to resume.)_";
      this._emit({ type: "responseChunk", content: note });
      assistantTextForHistory += note;
      this._emit({ type: "continueAvailable" });
    }

    live.content = assistantTextForHistory;
    const userTurn = [...hist].reverse().find(m => m.role === "user" && !m.content.startsWith("Tool result for "));
    if (userTurn) this._persistExchange(userTurn.content, assistantTextForHistory);

    // Per-turn telemetry: post real measured usage so the user can see what each
    // turn cost in tokens/time/steps. Cost in $ is shown only when the provider
    // exposes per-token pricing (OpenRouter); otherwise tokens/time only.
    const inTok = Math.ceil(turnInputChars / 4);
    const outTok = Math.ceil(turnOutputChars / 4);
    const elapsedMs = Date.now() - turnStart;
    const cost = this._multiClient.estimateCost(modelId, inTok, outTok);
    this._outputChannel.appendLine(
      `[turn] ${modelId} — ${inTok} in / ${outTok} out tok, ${turnToolCalls} tool call(s), ${turnIterations} step(s), ${(elapsedMs / 1000).toFixed(1)}s` +
      (cost !== null ? `, ~$${cost.toFixed(4)}` : "")
    );
    this._emit({
      type: "turnStats",
      model: modelId,
      inputTokens: inTok,
      outputTokens: outTok,
      toolCalls: turnToolCalls,
      steps: turnIterations,
      elapsedMs,
      costUsd: cost,
      modelUsage: this._turnAgentUsage,
      modelUsageSummary: this._formatAgentUsageSummary(),
    });
  }

  private async _runAgentLoop(modelId: string, temperature: number, maxTokens: number) {
    this._resetTurnAgentUsage(modelId);
    const MAX_ITER = 30;
    let iteration = 0;
    let completed = false;
    let fullResponse = "";
    const hist = this._activeTurnHistory || this._conversationHistory;

    while (iteration < MAX_ITER) {
      iteration++;
      const messages: ChatMessage[] = [{ role: "system", content: this._getSystemPrompt() }, ...this._budgetHistory(hist, maxTokens)];
      let rawIter = "";
      let lastThinkSent = "";

      for await (const chunk of this._multiClient.streamChat(modelId, messages, { temperature, max_tokens: maxTokens }, this._abortController?.signal)) {
        rawIter += chunk;
        const { thinkContent, visible, isThinking } = this._processStreamChunk(rawIter);
        if (thinkContent && thinkContent !== lastThinkSent) {
          this._emit({ type: "thinkingChunk", content: thinkContent, done: !isThinking });
          lastThinkSent = thinkContent;
        }
        this._emit({ type: "responseReplace", content: fullResponse + visible });
        this._scheduleLivePersist();
      }

      const { visible: cleanIter } = this._processStreamChunk(rawIter);
      fullResponse += cleanIter;

      const toolCalls = parseToolCalls(cleanIter);
      if (toolCalls.length === 0) { completed = true; break; }

      for (const call of toolCalls) {
        if (call.tool === "delegateSubAgent") {
          const subResult = await this._handleSubAgent(call.args, modelId, temperature, maxTokens);
          hist.push({ role: "assistant", content: cleanIter });
          hist.push({ role: "user", content: subResult.slice(0, 8000) });
          continue;
        }

        // Check if this is an MCP tool call (mcp:<server>:<tool>)
        if (this._mcpManager.isMcpTool(call.tool)) {
          fullResponse += "\n\n**Running MCP:** `" + call.tool + "`\n";
          this._emit({ type: "responseReplace", content: fullResponse });
          try {
            const result = await this._mcpManager.callTool(call.tool, call.args);
            fullResponse += "\n```\n" + result.slice(0, 5000) + "\n```\n";
            this._emit({ type: "toolResult", toolName: call.tool, status: "success", content: result.slice(0, 3000) });
            this._emit({ type: "responseReplace", content: fullResponse });
            hist.push({ role: "assistant", content: cleanIter });
            hist.push({ role: "user", content: "Tool result for " + call.tool + ":\n" + result.slice(0, 5000) });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            fullResponse += "\n**MCP error:** " + errMsg + "\n";
            this._emit({ type: "toolResult", toolName: call.tool, status: "error", content: errMsg });
            this._emit({ type: "responseReplace", content: fullResponse });
          }
          continue;
        }

        const tool = this._toolRegistry.getTool(call.tool);
        if (!tool || !this._toolRegistry.isEnabled(call.tool)) {
          const msg = "\n\n**Tool not available:** `" + call.tool + "`\n\n";
          fullResponse += msg;
          this._emit({ type: "responseReplace", content: fullResponse });
          continue;
        }

        const autoApprove = shouldAutoApprove(this._approvalMode, tool);
        if (!autoApprove) {
          this._emit({
            type: "toolApproval", toolName: call.tool, args: call.args,
            dangerLevel: tool.dangerLevel, description: tool.description
          });
          const approved = await this._waitForApproval(call.tool);
          if (!approved) {
            fullResponse += "\n\n**Skipped:** `" + call.tool + "` (denied)\n\n";
            this._emit({ type: "responseReplace", content: fullResponse });
            continue;
          }
        }

        fullResponse += "\n\n**Running:** `" + call.tool + "`\n";
        this._emit({ type: "responseReplace", content: fullResponse });

        try {
          const result = await tool.execute(call.args, this._outputChannel);
          fullResponse += "\n```\n" + result.slice(0, 5000) + "\n```\n";
          this._emit({ type: "toolResult", toolName: call.tool, status: "success", content: result.slice(0, 3000) });
          this._emit({ type: "responseReplace", content: fullResponse });
          hist.push({ role: "assistant", content: cleanIter });
          hist.push({ role: "user", content: "Tool result for " + call.tool + ":\n" + result.slice(0, 5000) });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          fullResponse += "\n**Tool error:** " + errMsg + "\n";
          this._emit({ type: "toolResult", toolName: call.tool, status: "error", content: errMsg });
          this._emit({ type: "responseReplace", content: fullResponse });
        }
      }
      if (toolCalls.length > 0) continue;
      break;
    }
    if (!completed) {
      const usage = this._formatAgentUsageSummary();
      const note = "\n\n_(Paused after 30 tool/model steps to protect your context window, time, and credits. " +
        (usage ? "Models used this turn: " + usage + ". " : "") +
        "Press **Continue** or reply \"continue\" to resume.)_";
      fullResponse += note;
      this._emit({ type: "responseReplace", content: fullResponse });
      this._emit({ type: "continueAvailable" });
    }
    if (!hist.some((m) => m.content === fullResponse && m.role === "assistant")) {
      const finalMsg: ChatMessage = { role: "assistant", content: fullResponse };
      hist.push(finalMsg);
      this._activeTurnAssistant = finalMsg;
    }
    // Persist the full agent exchange
    const userTurn = [...hist].reverse().find(m => m.role === "user" && !m.content.startsWith("Tool result for "));
    if (userTurn) this._persistExchange(userTurn.content, fullResponse);
  }

  /** Resolve a model preference ('worker'|'reviewer'|'fast'|'reasoning'|'coding'|'auto'|<id>) to a concrete model id. */
  private _resolveSubModel(modelPref: string, task: string, parentModelId: string): string {
    const pref = String(modelPref || "").trim();
    const activeProfile = this._activeAgenticProfile();
    const taskType = classifyTask(task);
    const trait = taskType === "reasoning" ? "reasoning" : "coding";

    if (activeProfile) {
      const profileFallback = () =>
        this._firstAvailable([activeProfile.defaultWorkerModel, ...activeProfile.workerModels], parentModelId) ||
        this._firstAvailable(activeProfile.reviewerModels, parentModelId) || parentModelId;
      if (!pref || pref === "auto" || pref === "worker") return profileFallback();
      if (pref === "reviewer") return this._firstAvailable(activeProfile.reviewerModels, parentModelId) || profileFallback();
      if (pref === "cheap" || pref === "free") {
        if (activeProfile.costPolicy === "cost-first" || activeProfile.allowCheapFallback) {
          return this._pickWorkerModel("coding", parentModelId, true);
        }
        return profileFallback();
      }
      if (["fast", "reasoning", "coding"].includes(pref)) {
        const pool = [...activeProfile.workerModels, ...activeProfile.reviewerModels];
        const matching = pool.find(id => {
          const m = this._cachedModels.find(x => x.id === id);
          return m && id !== parentModelId && (pref === "fast" || (pref === "reasoning" ? m.supportsThinking : true));
        });
        return matching || profileFallback();
      }
      const explicit = this._cachedModels.find(m => m.id === pref || `${m.provider}:${m.id}` === pref);
      if (explicit) {
        const explicitId = explicit.id;
        const inPool = [activeProfile.mainModel, ...activeProfile.workerModels, ...activeProfile.reviewerModels].includes(explicitId) || [activeProfile.mainModel, ...activeProfile.workerModels, ...activeProfile.reviewerModels].includes(pref);
        if (inPool || activeProfile.allowPremiumWorkers || activeProfile.allowCheapFallback) return explicitId;
      }
      return profileFallback();
    }

    if (pref && pref !== "auto") {
      if (["cheap", "free", "fast", "reasoning", "coding"].includes(pref)) { const mapped = pref === "fast" ? "speed" : (pref === "cheap" || pref === "free" ? "coding" : pref) as "coding" | "reasoning" | "speed"; return this._pickWorkerModel(mapped, parentModelId, pref === "cheap" || pref === "free"); }
      const explicit = this._cachedModels.find(m => m.id === pref || `${m.provider}:${m.id}` === pref);
      if (explicit && explicit.id !== parentModelId) return explicit.id;
    }
    return this._pickWorkerModel(trait, parentModelId, false);
  }

  private async _runSubAgent(task: string, subModelId: string, context: string, temperature: number, maxTokens: number): Promise<string> {
    const system = [
      "You are a focused Sentinel Coder sub-agent. Complete only the delegated task.",
      "Be concise, concrete, and honest about uncertainty.",
      "Do not claim files were edited or commands were run unless the parent explicitly gave you tool results.",
      "Return actionable findings, code snippets, tests, risks, and recommendations for the main model to verify."
    ].join("\n");
    const user = `Delegated task:\n${task}\n\nShared context:\n${context || "(none)"}`;
    let out = "";
    const subMax = Math.max(1024, Math.min(maxTokens || 4096, 8192));
    for await (const chunk of this._multiClient.streamChat(subModelId, [{ role: "system", content: system }, { role: "user", content: user }], { temperature: Math.min(temperature || 0.3, 0.5), max_tokens: subMax }, this._abortController?.signal)) {
      out += chunk;
      if (out.length > 24000) break;
    }
    return out.trim() || "(sub-agent returned no content)";
  }

  private async _handleSubAgent(
    args: Record<string, unknown>,
    parentModelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const task = (args.task as string) || "No task specified";
    // Agentic profiles control default worker choice. Without a profile, Boss mode
    // keeps the older budget-conscious default.
    const modelPref = (args.model as string) || (this._activeAgenticProfile() ? "worker" : (this._orchestration === "boss" ? "cheap" : "auto"));
    const context = (args.context as string) || "";
    const subModelId = this._resolveSubModel(modelPref, task, parentModelId);
    const result = await this._runSubAgent(task, subModelId, context, temperature, maxTokens);
    return `Sub-agent (${subModelId.split(":").pop()}) result:\n${result.slice(0, 8000)}`;
  }

  /** Run several sub-agents in PARALLEL and return an aggregated summary of all results. */
  private async _handleTeam(
    args: Record<string, unknown>,
    parentModelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    let tasks: Array<{ task: string; model?: string }> = [];
    const raw = args.tasks;
    if (typeof raw === "string") {
      try { tasks = JSON.parse(raw); } catch { tasks = []; }
    } else if (Array.isArray(raw)) {
      tasks = raw as Array<{ task: string; model?: string }>;
    }
    const activeProfile = this._activeAgenticProfile();
    const maxAgents = activeProfile ? activeProfile.maxParallelAgents : 5;
    tasks = tasks.filter((t) => t && typeof t.task === "string" && t.task.trim().length > 0).slice(0, maxAgents);
    if (tasks.length === 0) return "delegateTeam error: no valid tasks provided. Expected tasks=[{task, model?}].";

    const context = (args.context as string) || "";
    // Team defaults now come from the active Agentic Profile. Only legacy Boss
    // mode defaults to cheap fan-out when no profile is selected.
    const bossDefault = activeProfile ? "worker" : "cheap";
    const runs = tasks.map((t) => {
      const subModelId = this._resolveSubModel(t.model || bossDefault, t.task, parentModelId);
      const started = Date.now();
      return this._runSubAgent(t.task, subModelId, context, temperature, maxTokens)
        .then((res) => {
          this._recordAgentUsage("team", subModelId, "team agent", t.task, Date.now() - started, res.length);
          return { task: t.task, model: subModelId, res };
        })
        .catch((e: unknown) => {
          const msg = "error: " + (e instanceof Error ? e.message : String(e));
          this._recordAgentUsage("team", subModelId, "team agent", t.task, Date.now() - started, msg.length);
          return { task: t.task, model: subModelId, res: msg };
        });
    });

    const results = await Promise.all(runs);
    return results
      .map((r, i) => `### Sub-agent ${i + 1} (${r.model})\nTask: ${r.task}\n${r.res.slice(0, 4000)}`)
      .join("\n\n");
  }

  /** OpenAI-style specs for the orchestration tools (not in the normal tool registry). */
  private _orchestrationSpecs(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    const specs: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> = [
      {
        type: "function",
        function: {
          name: "requestApprovalMode",
          description: "Ask the user for permission to change the tool-approval mode. Use this to escalate from 'default' (standard — every action is confirmed and Continue is manual) to 'bypass' (auto-approve safe/moderate actions, still ask for dangerous actions, Continue remains manual) or 'autopilot' (auto-approve everything and auto-continue through step ceilings) when a long multi-step task would otherwise need many confirmations — or to step back down to 'default'. The user always sees and must allow the change before it takes effect.",
          parameters: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["default", "bypass", "autopilot"], description: "Target mode: 'default' (manual approvals/manual Continue), 'bypass' (auto-approve safe/moderate, ask dangerous, manual Continue), or 'autopilot' (auto-approve all and auto-continue)." },
              reason: { type: "string", description: "Short reason shown to the user explaining why the change helps." },
            },
            required: ["mode"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "updatePlan",
          description: "Maintain a visible step-by-step plan for a multi-step task. Call this at the START of any non-trivial task with the full list of steps, then call it again to mark steps done as you progress. Keeps you and the user aligned on long enterprise builds. Exactly one step should be 'in-progress' at a time.",
          parameters: {
            type: "object",
            properties: {
              steps: { type: "string", description: "JSON array of {\"title\": string, \"status\": \"pending\"|\"in-progress\"|\"done\"} objects describing the whole plan." },
            },
            required: ["steps"],
          },
        },
      },
    ];
    if (this._cachedModels.length < 2) return specs; // no point delegating with a single model
    specs.push(
      {
        type: "function",
        function: {
          name: "delegateSubAgent",
          description: "Delegate one focused sub-task to a configured worker/reviewer model and get its result back. With an Agentic Profile active, model:'worker' uses the profile default worker and model:'reviewer' uses the reviewer pool. Use cheap/free only when the profile permits it or the sub-task is low-risk.",
          parameters: {
            type: "object",
            properties: {
              task: { type: "string", description: "The sub-task to complete." },
              model: { type: "string", description: "Model selector: 'worker' | 'reviewer' | 'cheap' | 'free' | 'fast' | 'reasoning' | 'coding' | 'auto' | an explicit model id. If an Agentic Profile is active, prefer 'worker'/'reviewer' or explicit profile models." },
              context: { type: "string", description: "Extra context the sub-agent needs." },
            },
            required: ["task"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "delegateTeam",
          description: "Run up to the active profile limit (max 5) sub-agents IN PARALLEL on independent sub-tasks, then receive all results together. With Agentic Profiles, choose worker/reviewer/explicit models per task; use cheap/free only for low-risk or cost-first workflows.",
          parameters: {
            type: "object",
            properties: {
              tasks: { type: "string", description: "JSON array of {\"task\": string, \"model\"?: string} objects (max 5). model is 'worker'|'reviewer'|'cheap'|'free'|'fast'|'reasoning'|'coding'|'auto'|id." },
              context: { type: "string", description: "Shared context given to every sub-agent." },
            },
            required: ["tasks"],
          },
        },
      }
    );
    return specs;
  }

  /**
   * Ask the user (via an approval card) to switch the tool-approval mode. Returns
   * a status string for the model and applies the new mode + updates the UI only
   * when the user explicitly allows it.
   */
  private async _handleApprovalModeRequest(args: Record<string, unknown>): Promise<string> {
    const target = String(args.mode || "").toLowerCase();
    const reason = typeof args.reason === "string" ? args.reason : "";
    const valid: ApprovalMode[] = ["default", "bypass", "autopilot"];
    if (!valid.includes(target as ApprovalMode)) {
      return "Invalid mode '" + target + "'. Must be one of: default, bypass, autopilot.";
    }
    if (this._approvalMode === target) {
      return "Approval mode is already '" + target + "'. No change needed.";
    }
    const labels: Record<string, string> = {
      default: "Standard (confirm every action)",
      bypass: "Bypass (auto-approve safe/moderate actions; ask dangerous; manual Continue)",
      autopilot: "Autopilot (auto-approve everything and auto-continue)",
    };
    const tag = "approvalMode:" + target;
    this._emit({
      type: "toolApproval",
      toolName: tag,
      description: "Switch tool-approval mode to " + labels[target] + (reason ? " — " + reason : ""),
      args: { from: this._approvalMode, to: target },
      dangerLevel: target === "autopilot" ? "dangerous" : "moderate",
    });
    const approved = await this._waitForApproval(tag);
    if (!approved) {
      return "User declined the approval-mode change. Staying in '" + this._approvalMode + "' mode.";
    }
    const previous = this._approvalMode;
    this._approvalMode = target as ApprovalMode;
    this._emit({ type: "approvalModeChanged", mode: target });
    return "User allowed the change. Approval mode is now '" + target + "' (was '" + previous + "').";
  }

  /** Update the live multi-step plan and push it to the webview for the user to see. */
  private _handleUpdatePlan(args: Record<string, unknown>): string {
    let steps: Array<{ title: string; status: string }> = [];
    try {
      const raw = typeof args.steps === "string" ? JSON.parse(args.steps) : args.steps;
      if (Array.isArray(raw)) {
        steps = raw
          .map((s: unknown) => {
            const o = (s || {}) as Record<string, unknown>;
            const title = String(o.title || "").trim();
            let status = String(o.status || "pending").toLowerCase();
            if (!["pending", "in-progress", "done"].includes(status)) status = "pending";
            return { title, status };
          })
          .filter((s) => s.title);
      }
    } catch {
      return "Could not parse 'steps'. Provide a JSON array of {title, status} objects.";
    }
    if (steps.length === 0) return "Plan was empty — provide at least one step.";
    this._currentPlan = steps;
    this._emit({ type: "planUpdate", steps });
    const done = steps.filter((s) => s.status === "done").length;
    return `Plan updated (${done}/${steps.length} done):\n` + steps.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n");
  }

  /** Snapshot a file's current content (or null if it doesn't exist yet) once per turn. */


  private _checkpointStats(): { filesTouched: number; createdFiles: number; modifiedFiles: number; bytesBefore: number; bytesAfter: number } {
    let createdFiles = 0;
    let modifiedFiles = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;
    for (const [abs, prior] of this._checkpoints.entries()) {
      if (prior === null) createdFiles += 1;
      else {
        modifiedFiles += 1;
        bytesBefore += Buffer.byteLength(prior, "utf8");
      }
      try {
        if (fs.existsSync(abs)) bytesAfter += fs.statSync(abs).size;
      } catch { /* ignore stat failures */ }
    }
    return { filesTouched: this._checkpoints.size, createdFiles, modifiedFiles, bytesBefore, bytesAfter };
  }

  private _postCheckpointStatus(): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const files = Array.from(this._checkpoints.entries()).map(([abs, prior]) => ({
      path: workspaceRoot ? path.relative(workspaceRoot, abs) : abs,
      absolutePath: abs,
      action: prior === null ? "created" : "modified",
    }));
    this._view?.webview.postMessage({
      type: "checkpointStatus",
      total: files.length,
      files: files.slice(0, 80),
      truncated: files.length > 80,
    });
  }

  private _postTaskSummary(): void {
    const recent = this._conversationHistory.slice(-24).map((m, idx) => ({
      index: this._conversationHistory.length - 24 + idx + 1,
      role: m.role,
      preview: String(m.content || "").replace(/\s+/g, " ").slice(0, 240),
    }));
    const issues = recent
      .filter((m) => /error|failed|timeout|diagnostic|warning|blocked|denied|429|401|403|500/i.test(m.preview))
      .slice(-12);
    this._view?.webview.postMessage({
      type: "taskSummary",
      messages: recent,
      issues,
      queued: this._queuedUserMessages.length,
      checkpoints: this._checkpoints.size,
    });
  }

  private _postMediaHelp(): void {
    this._view?.webview.postMessage({
      type: "systemNote",
      content: [
        "Media tools ready:",
        "- generateImage(prompt, model='azure:gpt-image-2') -> PNG in .sentinel/generated/images",
        "- generateSpeech(text, voice='en-US-JennyNeural') -> MP3 in .sentinel/generated/audio",
        "- transcribeAudio(path) -> Speechmatics transcript for audio/video files",
        "- captureScreenshot(outputName) -> PNG screenshot in .sentinel/generated/screenshots",
        "- ocrImage(path) -> OCR text from screenshots/images when Tesseract is installed; metadata fallback otherwise",
        "- inspectFile(path) -> document/media metadata and previews",
        "- prepareGeneratedWorkspace() -> organized generated-content folders",
        "Tip: attach files, paste Windows paths, or click Screenshot/OCR, then ask Sentinel to inspect, generate, transcribe, or edit."
      ].join("<br>")
    });
  }

  private _captureCheckpoint(p: string): void {
    const abs = this._resolveAbs(p);
    if (!abs || this._checkpoints.has(abs)) return;
    try {
      const prior = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") as string : null;
      this._checkpoints.set(abs, prior);
    } catch {
      this._checkpoints.set(abs, null);
    }
  }

  /** Restore every file captured this conversation to its pre-edit state. */
  private _revertCheckpoints(): string {
    if (this._checkpoints.size === 0) return "No agent file changes to revert.";
    let restored = 0;
    let removed = 0;
    try {
      for (const [abs, prior] of this._checkpoints.entries()) {
        try {
          if (prior === null) {
            if (fs.existsSync(abs)) { fs.unlinkSync(abs); removed++; }
          } else {
            fs.writeFileSync(abs, prior, "utf-8");
            restored++;
          }
        } catch { /* skip individual failures */ }
      }
    } catch { /* fs unavailable */ }
    this._checkpoints.clear();
    this._filesTouchedThisTurn.clear();
    return `Reverted agent changes: ${restored} file(s) restored, ${removed} new file(s) removed.`;
  }

  private _resolveAbs(p: string): string | null {
    try {
      if (path.isAbsolute(p)) return p;
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) return null;
      return path.join(ws.uri.fsPath, p);
    } catch {
      return null;
    }
  }

  /**
   * After the model thinks it is done, run the VS Code diagnostics on files it
   * edited this turn. If there are errors, return a feedback message so the agent
   * fixes them; otherwise return null (truly done).
   */
  private async _verifyTouchedFiles(): Promise<string | null> {
    if (this._filesTouchedThisTurn.size === 0) return null;
    // The language server needs a moment to re-analyze freshly edited files.
    // Open each document (so a provider is attached) then let diagnostics settle
    // before reading them, otherwise we miss errors the agent just introduced.
    const uris: vscode.Uri[] = [];
    for (const p of this._filesTouchedThisTurn) {
      const abs = this._resolveAbs(p);
      if (!abs) continue;
      const uri = vscode.Uri.file(abs);
      uris.push(uri);
      try { await vscode.workspace.openTextDocument(uri); } catch { /* deleted file */ }
    }
    await new Promise<void>((r) => setTimeout(r, 1200));
    const problems: string[] = [];
    for (const uri of uris) {
      try {
        const p = vscode.workspace.asRelativePath(uri);
        const diags = vscode.languages.getDiagnostics(uri)
          .filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        if (diags.length > 0) {
          const lines = diags.slice(0, 8).map(d => `  line ${d.range.start.line + 1}: ${d.message}`).join("\n");
          problems.push(`${p} (${diags.length} error${diags.length > 1 ? "s" : ""}):\n${lines}`);
        }
      } catch { /* ignore */ }
    }
    if (problems.length === 0) return null;
    return "AUTO-VERIFY found compile/lint errors in files you just edited. Fix them before finishing:\n\n" +
      problems.join("\n\n") +
      "\n\nUse readFile + editFile to correct each error, then continue.";
  }

  /**
   * Context-window manager: keep the conversation under a token budget so long
   * agent sessions never overflow the model or balloon cost. Estimates tokens at
   * ~4 chars each, always keeps the most recent turns intact, and replaces older
   * turns with a compact text summary placed at the front of the kept window.
   */
  /**
   * Context window (in tokens) of the currently selected model, looked up from
   * the live model catalog. Returns 0 when unknown (e.g. "auto" router) so the
   * caller falls back to the configured fixed budget.
   */
  private _selectedRuntimeModelId(): string {
    const raw = this._selectedModel || "";
    if (this._isStandardSingleModelSelection(raw)) return "auto";
    if (raw.startsWith("agentic:")) {
      const profile = this._activeAgenticProfile();
      return profile ? this._profileMainModel(profile) : "auto";
    }
    return raw;
  }

  private _findModelMetadata(modelId: string): ModelOption | undefined {
    if (!modelId || modelId === "auto") return undefined;
    const suffix = modelId.split(":").pop() || modelId;
    return this._cachedModels.find(
      (m) => m.id === modelId || m.id === suffix || (m.id.split(":").pop() || m.id) === suffix
    );
  }

  private _currentModelContextWindow(): number {
    const match = this._findModelMetadata(this._selectedRuntimeModelId());
    if (!match) return 0;
    // Use the provider-enforced cap when known. Some providers advertise a larger
    // marketing context window than the deployment currently accepts per request.
    const safeWindow = match.effectiveContextWindow && match.effectiveContextWindow > 0
      ? match.effectiveContextWindow
      : match.contextWindow;
    return safeWindow > 0 ? safeWindow : 0;
  }

  /** Real per-response output-token limit of a specific model from the live catalog (0 if unknown). */
  private _modelMaxOutputFor(modelId: string): number {
    const match = this._findModelMetadata(modelId);
    return match && match.maxOutputTokens > 0 ? match.maxOutputTokens : 0;
  }

  /** Output-token limit of the currently selected model (0 if unknown / auto). */
  private _currentModelMaxOutput(): number {
    return this._modelMaxOutputFor(this._selectedRuntimeModelId());
  }

  /**
   * Resolve the effective per-response max output tokens. A configured value of
   * 0 (or unset) means "Auto": use the selected model's full output capacity so
   * long answers are never truncated mid-response. A manual value is honored but
   * never allowed to exceed the model's real limit (which would error or stall).
   */
  private _effectiveMaxTokens(configured: number, modelId: string): number {
    const modelMax = this._modelMaxOutputFor(modelId);
    if (!configured || configured <= 0) {
      return modelMax > 0 ? modelMax : 8192;
    }
    return modelMax > 0 ? Math.min(configured, modelMax) : configured;
  }

  private _budgetHistory(history: ChatMessage[], maxTokens: number): ChatMessage[] {
    if (history.length === 0) return history;
    const estTokens = (s: string) => Math.ceil((s || "").length / 4);
    // Leave room for the model's own output; cap input around a sane ceiling.
    const cfg = vscode.workspace.getConfiguration("sentinelCoder");
    // Model-aware but cost-safe budget: know the selected model's real window,
    // but do NOT automatically fill a 1M-token model every turn. The setting is
    // the operator-controlled ceiling; raise it explicitly for long-context work.
    const modelWindow = this._currentModelContextWindow();
    const configured = cfg.get<number>("contextBudgetTokens", 64000);
    const safety = 12000; // reserve for system prompt + tool schemas + provider quirks
    const modelInputCap = modelWindow > 0 ? Math.max(8000, modelWindow - safety - maxTokens) : 0;
    const configuredCap = Math.max(8000, configured - maxTokens);
    const ctxBudget = modelInputCap > 0 ? Math.min(modelInputCap, configuredCap) : configuredCap;
    const total = history.reduce((n, m) => n + estTokens(m.content), 0);
    if (total <= ctxBudget) return history;

    // Keep peeling recent turns until we fill ~70% of the budget, summarize the rest.
    const kept: ChatMessage[] = [];
    let used = 0;
    let cutAt = 0;
    const keepTarget = ctxBudget * 0.7;
    for (let i = history.length - 1; i >= 0; i--) {
      const t = estTokens(history[i].content);
      if (used + t > keepTarget && kept.length >= 2) { cutAt = i + 1; break; }
      kept.unshift(history[i]);
      used += t;
      cutAt = i;
    }
    const older = history.slice(0, cutAt);
    if (older.length === 0) return kept;
    // Build a terse rolling summary of the dropped turns.
    const summaryLines = older.map(m => {
      const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
      const text = (m.content || "").replace(/\s+/g, " ").trim().slice(0, 280);
      return `- ${who}: ${text}`;
    });
    const summaryText = "[CONVERSATION SUMMARY — earlier turns were condensed to save context]\n" +
      summaryLines.join("\n") +
      "\n[END SUMMARY — continue from the recent turns below]";
    // Surface context pressure so the operator can see when condensing kicks in.
    try {
      this._outputChannel?.appendLine(
        `[context] ~${total} tok > budget ${ctxBudget}; condensed ${older.length} older turn(s), kept ${kept.length}.`
      );
    } catch { /* non-fatal */ }
    // Avoid two consecutive user messages (some providers, e.g. Anthropic,
    // require strict role alternation): merge the summary into the first kept
    // user turn when possible, otherwise prepend it as its own user message.
    if (kept[0] && kept[0].role === "user") {
      return [{ role: "user", content: summaryText + "\n\n" + kept[0].content }, ...kept.slice(1)];
    }
    const summary: ChatMessage = { role: "user", content: summaryText };
    return [summary, ...kept];
  }

  private _pickModelByTrait(trait: "coding" | "reasoning" | "speed"): string {
    let bestId = this._cachedModels[0]?.id || "ollama:sentinel-coder:latest";
    let bestScore = -1;
    for (const m of this._cachedModels) {
      const cap = getModelCapability(m.id);
      if (cap[trait] > bestScore) { bestScore = cap[trait]; bestId = m.id; }
    }
    return bestId;
  }

  /** Relative running cost of a model: lower = cheaper. Free/local = 0. */
  private _costRank(m: ModelOption): number {
    switch (m.pricing) {
      case "free": return 0;
      case "local": return 0;
      case "free-tier": return 1;
      case "subscription": return 2;          // Azure credits — cheap for this user
      case "pay-per-use": {
        // Parse "$x/M in" so we prefer genuinely cheap paid models.
        const m2 = (m.pricingNote || "").match(/\$([0-9.]+)\s*\/M/);
        const inPrice = m2 ? parseFloat(m2[1]) : 5;
        return 3 + Math.min(inPrice, 50);     // 3.x..53
      }
      default: return 10;
    }
  }

  /** Pick the cheapest capable WORKER model for the boss to delegate building to.
   * Prefers free/local, then free-tier, then cheap paid; requires a minimum
   * capability for the trait and (optionally) tool support. Excludes the boss. */
  private _pickWorkerModel(trait: "coding" | "reasoning" | "speed", bossId: string, needTools: boolean): string {
    const candidates = this._cachedModels.filter(m => {
      if (m.id === bossId) return false;
      if (needTools && !m.supportsTools) return false;
      const cap = getModelCapability(m.id);
      return cap[trait] >= 6; // competent enough to draft
    });
    if (candidates.length === 0) {
      // Fall back to any non-boss model, else the boss itself.
      const any = this._cachedModels.filter(m => m.id !== bossId);
      return (any[0] || this._cachedModels[0])?.id || bossId;
    }
    candidates.sort((a, b) => {
      const ca = this._costRank(a), cb = this._costRank(b);
      if (ca !== cb) return ca - cb;                       // cheapest first
      const capA = getModelCapability(a.id)[trait];
      const capB = getModelCapability(b.id)[trait];
      return capB - capA;                                  // then most capable
    });
    return candidates[0].id;
  }

  /** True when the selected model is an expensive/frontier "boss" worth protecting
   * with cheap workers (premium reasoning models, top Claude/GPT-5/Grok, etc.). */
  private _isPremiumModel(modelId: string): boolean {
    const m = this._cachedModels.find(x => x.id === modelId);
    const id = modelId.toLowerCase();
    const byName = /(gpt-5|opus-4|claude-opus|grok-4|o3|o4|gemini-2\.5-pro|gemini-3|deepseek-reasoner|model-router)/.test(id);
    const byCost = m ? this._costRank(m) >= 3 : false; // any real paid model
    const cap = getModelCapability(modelId);
    return byName || byCost || cap.reasoning >= 9;
  }

  private _waitForApproval(toolName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const disposable = this._view!.webview.onDidReceiveMessage((data) => {
        if (data.type === "approveToolCall" && data.toolName === toolName) { disposable.dispose(); resolve(true); }
        else if (data.type === "rejectToolCall" && data.toolName === toolName) { disposable.dispose(); resolve(false); }
      });
      setTimeout(() => { disposable.dispose(); resolve(false); }, 60000);
    });
  }

  private _getHtmlForWebview(): string {
    const webview = this._view!.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "sidebar.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "sidebar.css"));
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
  <title>Sentinel Coder</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="top-bar">
    <div class="model-select">
      <select id="model-select" title="Select model"><option value="auto">Auto (best for task)</option></select>
    </div>
    <button class="icon-btn" id="btn-refresh" title="Refresh models">&#x21bb;</button>
    <button class="icon-btn" id="btn-history" title="Chat history / sessions">&#x1F551;</button>
    <button class="icon-btn" id="btn-new-chat" title="New chat">&#x2716;</button>
    <button class="icon-btn" id="btn-settings" title="Settings">&#x2699;</button>
  </div>
  <div class="mode-bar">
    <button class="mode-tab active" data-mode="agent">Agent</button>
    <button class="mode-tab" data-mode="ask">Ask</button>
    <button class="mode-tab" data-mode="plan">Plan</button>
    <button class="boss-toggle" id="boss-toggle" title="Boss Orchestrator: the premium model plans, reviews & finalizes while cheap/free worker models do the bulk building — saves credits.">&#x1F454; Boss</button>
  </div>
  <div class="approval-bar" id="approval-bar">
    <label>Approvals:</label>
    <button class="approval-btn active" data-approval="default" title="Ask before each tool use and show manual Continue">Default</button>
    <button class="approval-btn" data-approval="bypass" title="Auto-approve safe/moderate tools, ask dangerous, manual Continue">Bypass</button>
    <button class="approval-btn" data-approval="autopilot" title="Auto-approve all tools and auto-continue until done">Autopilot</button>
  </div>
  <div class="status-bar">
    <span class="status-dot" id="status-dot"></span>
    <span id="status-text">Connecting...</span>
    <span style="flex:1"></span>
    <span id="auto-model-badge" class="auto-badge" style="display:none"></span>
    <span id="mode-label">Agent</span>
  </div>
  <section class="media-studio-panel" aria-label="Media Studio models">
    <div class="panel-title-row">
      <span class="panel-title">Media Studio</span>
      <span class="panel-subtitle">image • video • audio • transcript</span>
    </div>
    <div class="media-model-grid">
      <button class="media-model-card" data-media-prompt="Generate a premium web hero image with generateImage using azure:gpt-image-2. Show the in-chat image card and saved path."><span>Image</span><strong>Azure gpt-image-2</strong><small>PNG / design assets</small></button>
      <button class="media-model-card" data-media-prompt="Generate a polished commercial design image with generateImage using azure:MAI-Image-2e. Show the in-chat image card and saved path."><span>Image</span><strong>Azure MAI-Image-2e</strong><small>creative visuals</small></button>
      <button class="media-model-card" data-media-prompt="Ask me to choose a scenario, style, duration, target platform, and continuation goal. Then generate a Sora 2 video with generateVideo using azure:sora-2, show the in-chat video player and saved MP4 path."><span>Video</span><strong>Azure Sora 2</strong><small>MP4 ads / reels</small></button>
      <button class="media-model-card" data-media-prompt="Generate a short voiceover with generateSpeech using azure:speech-tts. Show the in-chat audio player and saved MP3 path."><span>Audio</span><strong>Azure Speech TTS</strong><small>MP3 voiceover</small></button>
      <button class="media-model-card" data-media-prompt="Transcribe the attached or latest generated audio/video with transcribeAudio using Speechmatics. Show the transcript and source path."><span>Transcript</span><strong>Speechmatics</strong><small>audio/video text</small></button>
    </div>
  </section>
  <section class="collab-status-panel" aria-label="Project collaboration status">
    <div><strong>Project Studio</strong><span> checkpoints • tasks/issues • generated assets • file paths</span></div>
    <div class="collab-actions"><button id="btn-restore-checkpoints-top" class="mini-link-btn">Restore checkpoints</button><button id="btn-previous-tasks-top" class="mini-link-btn">Previous tasks/issues</button></div>
  </section>
  <div class="chat-container" id="chat-container"></div>
  <div class="typing-indicator" id="typing">Sentinel is thinking...</div>
  <div class="continue-bar" id="continue-bar" style="display:none">
    <button class="continue-btn" id="continue-btn" title="Keep the agent going from where it stopped">▶ Continue</button>
    <span class="continue-hint">Paused at the step limit — pick up where it left off.</span>
  </div>
  <div class="input-area">
    <div class="chat-toolbar" aria-label="Chat helper tools">
      <button class="toolbar-btn" id="btn-attach" title="Attach screenshots/images/files. Saved paths appear below before sending." type="button">Attach</button>
      <button class="toolbar-btn" id="btn-paste-path" title="Paste clipboard file path into prompt" type="button">Path</button>
      <button class="toolbar-btn" id="btn-media-help" title="Show media/document generation tools" type="button">Media</button>
      <button class="toolbar-btn primary" id="btn-open-studio" title="Open Media & Document Studio viewer" type="button">Open Studio</button>
      <button class="toolbar-btn" id="btn-screenshot" title="Capture current screen and inspect UI visually" type="button">Screenshot</button>
      <button class="toolbar-btn" id="btn-ocr" title="OCR/inspect the latest screenshot or attached image" type="button">OCR</button>
      <button class="toolbar-btn" id="btn-checkpoints" title="Show restore checkpoint status" type="button">Checkpoints</button>
      <button class="toolbar-btn" id="btn-issues" title="Show previous tasks and issue summary" type="button">Issues</button>
      <button class="toolbar-btn danger" id="btn-revert-checkpoints" title="Restore all files changed by the agent to their saved checkpoints" type="button">Restore</button>
      <button class="toolbar-btn" id="btn-firewall" title="Run an enforced post-turn Security Firewall scan when enabled" type="button" aria-pressed="false">Firewall</button>
      <span class="toolbar-hint">Enter sends - Shift+Enter newline - Send while running adds follow-up input</span>
      <input id="file-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.txt,.md,.json,.yaml,.yml,.log" multiple style="display:none" />
    </div>
    <div id="attachment-tray" class="attachment-tray" aria-live="polite"></div>
    <textarea id="user-input" placeholder="Ask Sentinel Coder... attach screenshots, paste paths, or add follow-up instructions while it works..." rows="1"></textarea>
    <button class="send-btn" id="send-btn">Send</button>
    <button class="stop-btn" id="stop-btn">Stop</button>
  </div>
  <div class="settings-overlay" id="sessions-panel">
    <div class="settings-header">
      <span>Chat history</span>
      <div>
        <button class="action-btn primary" id="btn-session-new">New chat</button>
        <button class="icon-btn" id="btn-close-sessions">&times;</button>
      </div>
    </div>
    <div id="session-list" class="session-list"></div>
  </div>
  <div class="settings-overlay" id="settings-panel">
    <div class="settings-header">
      <span>Settings</span>
      <button class="icon-btn" id="btn-close-settings">&times;</button>
    </div>
    <div class="settings-tabs">
      <button class="settings-tab active" data-stab="tools">Tools</button>
      <button class="settings-tab" data-stab="skills">Skills</button>
      <button class="settings-tab" data-stab="agentic">Agentic</button>
      <button class="settings-tab" data-stab="models">Models</button>
      <button class="settings-tab" data-stab="providers">Providers</button>
      <button class="settings-tab" data-stab="mcp">MCP Servers</button>
      <button class="settings-tab" data-stab="general">General</button>
    </div>
    <div id="settings-content">
      <div class="settings-pane" id="settings-tools" style="display:block">
        <div id="tool-list"></div>
      </div>
      <div class="settings-pane" id="settings-skills" style="display:none">
        <div class="settings-section">
          <p style="font-size:12px;color:var(--desc-fg);margin-bottom:6px">
            <strong>Skills</strong> are reusable instruction packs (domain knowledge, stacks, conventions, workflows). Enabled skills are injected into the model's system prompt so it follows your standards and works better on recurring tasks.
          </p>
          <div class="settings-row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">
            <button class="action-btn primary" id="btn-skill-new">+ New skill</button>
            <button class="action-btn" id="btn-skill-import">Import from workspace</button>
            <button class="action-btn" id="btn-skill-refresh">Refresh</button>
          </div>
          <div id="skill-editor" class="skill-editor" style="display:none">
            <input type="text" id="skill-name" placeholder="Skill name (e.g. CarphaCom Stack)" style="width:100%;margin-bottom:6px">
            <input type="text" id="skill-desc" placeholder="Short description / WHEN to use it" style="width:100%;margin-bottom:6px">
            <textarea id="skill-body" placeholder="Skill content (Markdown). Conventions, commands, stacks, do's & don'ts..." rows="10" style="width:100%;margin-bottom:6px"></textarea>
            <div class="settings-row" style="gap:6px">
              <button class="action-btn primary" id="btn-skill-save">Save skill</button>
              <button class="action-btn" id="btn-skill-cancel">Cancel</button>
            </div>
          </div>
          <div id="skill-list"></div>
        </div>
      </div>
      <div class="settings-pane" id="settings-agentic" style="display:none">
        <div class="settings-section">
          <p style="font-size:12px;color:var(--desc-fg);margin-bottom:6px"><strong>Agentic Profiles</strong> configure reusable multi-model workflows: main orchestrator/verifier, workers, reviewers, cost policy, and max parallel sub-agents. Profiles show in the top model selector.</p>
          <div class="settings-row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px"><button class="action-btn primary" id="btn-agentic-new">+ New profile</button><button class="action-btn" id="btn-agentic-refresh">Refresh</button></div>
          <div id="agentic-editor" class="agentic-editor" style="display:none">
            <input type="hidden" id="agentic-id"><input type="text" id="agentic-name" placeholder="Profile name" style="width:100%;margin-bottom:6px"><input type="text" id="agentic-desc" placeholder="Short description" style="width:100%;margin-bottom:6px">
            <label>Main/orchestrator model</label><input type="text" id="agentic-main" placeholder="azure:gpt-4.1" style="width:100%;margin-bottom:6px"><label>Worker models</label><textarea id="agentic-workers" rows="3" style="width:100%;margin-bottom:6px"></textarea><label>Reviewer models</label><textarea id="agentic-reviewers" rows="2" style="width:100%;margin-bottom:6px"></textarea><label>Default worker model</label><input type="text" id="agentic-default-worker" style="width:100%;margin-bottom:6px">
            <div class="settings-row" style="gap:6px;flex-wrap:wrap"><label>Cost policy <select id="agentic-cost"><option value="quality-first">quality-first</option><option value="balanced">balanced</option><option value="cost-first">cost-first</option><option value="novelty-lab">novelty-lab</option></select></label><label>Max parallel <input type="number" id="agentic-max" min="1" max="5" value="3" style="width:60px"></label><label><input type="checkbox" id="agentic-premium"> Allow premium workers</label><label><input type="checkbox" id="agentic-cheap-fallback" checked> Allow cheap fallback</label></div>
            <textarea id="agentic-instructions" rows="5" placeholder="Profile-specific delegation rules..." style="width:100%;margin:6px 0"></textarea><div class="settings-row" style="gap:6px"><button class="action-btn primary" id="btn-agentic-save">Save profile</button><button class="action-btn" id="btn-agentic-cancel">Cancel</button></div>
          </div><div id="agentic-profile-list"></div>
        </div>
      </div>
      <div class="settings-pane" id="settings-models" style="display:none">
        <div class="settings-section">
          <div class="settings-row"><button class="action-btn primary" id="btn-add-model">Pull New Model</button><button class="action-btn" id="btn-refresh-models2">Refresh</button></div>
          <div id="model-list-settings"></div>
        </div>
      </div>
      <div class="settings-pane" id="settings-providers" style="display:none">
        <div id="provider-list"></div>
      </div>
      <div class="settings-pane" id="settings-mcp" style="display:none">
        <div class="settings-section">
          <p style="font-size:12px;color:var(--desc-fg);margin-bottom:6px">MCP (Model Context Protocol) servers add extra tools the agent can call (file access, web search, databases, memory). Each server runs <strong>locally on your machine</strong> as a small Node.js subprocess launched with <code>npx</code> — so Node.js must be installed and on your PATH.</p>
          <p style="font-size:12px;color:var(--desc-fg);margin-bottom:8px"><strong>filesystem</strong> and <strong>memory</strong> are free and work instantly. <strong>brave-search</strong> needs a free Brave API key and <strong>postgres</strong> needs a connection string — enter those below before connecting.</p>
          <div class="settings-row" style="margin-bottom:8px">
            <button class="action-btn" id="btn-mcp-import" title="Import server definitions from .vscode/mcp.json">Import from VS Code</button>
            <button class="action-btn" id="btn-mcp-refresh">Refresh</button>
          </div>
          <div id="mcp-result" class="mcp-result"></div>
          <div id="mcp-server-list"></div>
        </div>
      </div>
      <div class="settings-pane" id="settings-general" style="display:none">
        <div class="settings-section">
          <label>Temperature: <span id="set-temp-val">0.30</span></label>
          <input type="range" id="set-temp" min="0" max="100" value="30" style="width:100%">
          <label>Max Tokens (per response):</label>
          <input type="number" id="set-tokens" value="0" min="0" max="200000" step="256" style="width:100%">
          <p style="font-size:11px;color:var(--desc-fg);margin:2px 0 8px" id="set-tokens-hint"><strong>0 = Auto</strong> — use the selected model's full output limit so long answers are never cut off mid-response.</p>
          <label>Context budget (tokens before auto-summarizing old turns):</label>
          <input type="number" id="set-ctxbudget" value="64000" min="8000" max="400000" step="1000" style="width:100%">
          <label>Ollama URL (only for the local Ollama provider):</label>
          <input type="text" id="set-url" value="http://127.0.0.1:11434" style="width:100%">
          <button class="action-btn primary" id="btn-save-general" style="margin-top:8px">Save</button>
        </div>
      </div>
    </div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}