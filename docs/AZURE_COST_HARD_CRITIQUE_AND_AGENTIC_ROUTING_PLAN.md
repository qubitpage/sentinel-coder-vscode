# Azure Cost Hard Critique and Agentic Routing Plan

Status: added with Sentinel Coder One Studio 3.16.8 provider-authoritative discovery work.

## Executive summary

The current Azure usage pattern shows that the largest cost driver is not output generation, media generation, embeddings, or Grok. The dominant cost is repeated high-volume input sent to GPT-5.5-class Azure OpenAI deployments.

Visible spend sample provided by the operator:

| Meter | Spend |
|---|---:|
| Azure OpenAI GPT5 - 5.5 ShortCo input | EUR 326.75 |
| Azure OpenAI GPT5 - 5.5 ShortCo cached input | EUR 212.18 |
| Azure OpenAI GPT5 - 5.5 ShortCo output | EUR 39.57 |
| Azure Grok Models - 4.3 input | EUR 8.10 |
| Azure OpenAI Media - Sora 2 | EUR 7.22 |
| Azure OpenAI - GPT-4.1 output | EUR 0.69 |
| Azure OpenAI - GPT-4.1 input | EUR 0.43 |
| Azure OpenAI Media - Image 2 | EUR 0.40 |
| Azure Grok Models - 4.3 output | EUR 0.13 |
| Azure OpenAI - GPT-4.1 cached input | EUR 0.04 |

Approximate visible total: EUR 595.65.

GPT-5.5 input + cached input: EUR 538.93, roughly 90.5% of visible spend.

## Brutal critique

### 1. GPT-5.5 is being used too often as a default worker

GPT-5.5 should not be the everyday model for file inventory, routine diagnostics, boilerplate patching, long terminal verification commentary, or repeated compile-fix loops.

It is best used as:

- final judge;
- architecture/security reviewer;
- complex financial/business strategist;
- escalation model when cheaper models disagree;
- final release risk reviewer.

If GPT-5.5 receives every large dynamic-context turn, cost will remain high even if output is short.

### 2. Cached input is still expensive at this scale

Prompt caching reduces cost, but EUR 212.18 in cached GPT-5.5 input means too much stable context is being resent too often.

Required mitigation:

- send stable repo context as compact summaries;
- resend only changed files/snippets;
- hash context blocks and skip unchanged blocks;
- summarize tool transcripts after long runs;
- avoid including full historical messages when a state capsule is enough.

### 3. GPT-4.1 is underused

GPT-4.1 spend is tiny compared with GPT-5.5. For this workspace, GPT-4.1 should handle most production coding work:

- locating files;
- reading source;
- drafting TypeScript patches;
- explaining build errors;
- routine docs updates;
- packaging verification plans;
- structured refactors.

GPT-5.5 should review the final diff or hard decisions, not carry every intermediate turn.

### 4. Grok 4.3 is underused as a challenger

Grok 4.3 has useful value as a critique/challenge model. It should attack plans and assumptions before GPT-5.5 is invoked.

Recommended pattern:

1. GPT-4.1 drafts or implements.
2. Grok 4.3 critiques the plan/diff.
3. GPT-4.1 revises.
4. GPT-5.5 reviews only if the task is high-risk or disagreement remains.

### 5. 1M-token context is being treated as a default budget

Large context is capacity, not a spending target.

Recommended context budgets:

| Work type | Suggested budget |
|---|---:|
| Routine coding | 16K-48K |
| Non-trivial refactor | 48K-96K |
| Architecture review | 96K-192K |
| Full repo audit | 192K-256K |
| Emergency deep audit | 256K-512K |
| Rare explicit full-context run | 512K-1M |

The extension now separates provider context capacity from the operator-controlled setting `sentinelCoder.contextBudgetTokens`.

Default recommendation: 64,000 tokens.

## Recommended Agentic Profiles

### Default: Azure Cost-Smart Production

Use for most work.

- Orchestrator: GPT-4.1
- Challenger/reviewer: Grok 4.3
- Workers: GPT-4.1, GPT-5 Mini, or cheaper OpenAI-compatible models
- Escalation: GPT-5.5 only for final high-risk review

### Premium Deep Review

Use only for:

- security-critical changes;
- architecture decisions;
- production deployment reviews;
- financial/legal/strategy critique;
- unresolved disagreement between GPT-4.1 and Grok 4.3.

- Orchestrator: GPT-5.5
- Reviewer: Grok 4.3
- Worker: GPT-4.1
- Context budget: 128K-256K unless explicitly approved higher

### Cheap Bulk Worker Flow

Use for large but low-risk independent work.

- Orchestrator: GPT-4.1
- Workers: configured cheap/free providers or GPT-5 Mini
- Reviewer: GPT-4.1 or Grok 4.3
- GPT-5.5: disabled unless escalation is manually requested

## Automatic model discovery policy

Sentinel should not hardcode model availability when a provider API can report it.

Implemented policy:

1. Provider live API catalogs are authoritative when available.
2. Azure uses live Foundry/OpenAI deployment discovery.
3. OpenAI-compatible providers use `/models` discovery.
4. OpenRouter uses its live model catalog.
5. Curated lists are fallback-only when live calls fail or return no usable chat models.
6. Chat/Agentic selectors filter out non-chat models such as image, video, embeddings, speech, moderation, and rerank models.
7. Context metadata is read from provider fields where available and enriched by fallback heuristics only when necessary.

## Recommended next improvements

### 1. Context block hashing

Assign every context section a hash. If unchanged, send a compact reference instead of the full text.

Example:

- `activeFileHash`
- `diagnosticsHash`
- `gitDiffHash`
- `openTabsHash`
- `providerCatalogHash`

### 2. State capsules

After every long operation, compress the working state into a small capsule:

- objective;
- files changed;
- commands run;
- failures;
- current plan;
- known risks;
- next step.

Then use the capsule instead of replaying the full transcript.

### 3. RAG-first code retrieval

For large workspaces, retrieve only the top relevant files/snippets before invoking expensive models.

Recommended path:

1. embed code symbols/chunks with `text-embedding-3-large-regional` or a cheaper local embedding model;
2. retrieve top K snippets;
3. send snippets to GPT-4.1;
4. escalate to GPT-5.5 only for final review.

### 4. Model disagreement gates

Run GPT-5.5 only when cheaper models disagree materially.

Gate condition examples:

- reviewer says security risk is high;
- two build attempts failed;
- generated patch affects auth, payments, deployment, or secrets;
- task is explicitly marked high-risk.

### 5. Per-turn cost dashboard

Show:

- estimated prompt tokens;
- estimated output tokens;
- model calls by model;
- cached-input ratio when provider exposes it;
- approximate EUR cost per turn;
- warning when a turn exceeds budget.

### 6. Auto context budget presets

Add presets:

- Saver: 24K;
- Balanced: 64K;
- Deep Work: 128K;
- Architecture Review: 256K;
- Emergency Full Context: user approval required.

## Immediate operator recommendations

1. Use Azure Cost-Smart Production as the default profile.
2. Keep `sentinelCoder.contextBudgetTokens` at 64K by default.
3. Keep Dynamic Context max chars around 8K-12K.
4. Use GPT-5.5 only as escalation/final review.
5. Use Grok 4.3 as a hard-critique challenger.
6. Push routine implementation to GPT-4.1.
7. Use embeddings/RAG to retrieve code instead of sending massive workspace context.
8. Require explicit approval before any 256K+ context run.
9. Track model usage per turn and audit GPT-5.5 input volume weekly.
10. Treat live provider context windows as maximum capacity, not automatic prompt budget.
