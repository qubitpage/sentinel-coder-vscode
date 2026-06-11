# Sentinel Coder One Studio 3.16.7 Marketplace Landing Notes

Sentinel Coder One Studio 3.16.7 focuses on real provider discovery and cost-smart enterprise orchestration.

Recommended Marketplace headline: **Agentic AI coding with Azure Foundry live model discovery, visible model routing, and credit-safe context control.**

Highlights:

- Live Azure OpenAI/Foundry deployment discovery: every chat-capable deployment returned by the API appears in the model dropdown and Agentic profile dropdowns.
- OpenAI-compatible live model catalogs: providers that expose `/models` can populate current models automatically, with curated fallbacks when offline.
- Full context, controlled spend: large model windows are detected, but `sentinelCoder.contextBudgetTokens` defaults to 64K so 1M-token models are used intentionally.
- Azure Cost-Smart Production profile: GPT-4.1 for orchestration, Grok-4.3 for challenge/review, Model Router/free workers for low-risk drafts, GPT-5.5 for final hard review only.
- Dynamic Context defaults to 8K characters and remains configurable.
- Web-target VSIX remains available for vscode.dev/github.dev compatibility while Desktop VS Code remains the full autonomous agent host.

Verified Azure deployment families in the current workspace included GPT-4.1, GPT-5.5, GPT-5.4 Pro, GPT-5.4, Grok-4.3, GPT Chat Latest, Model Router, and non-chat embedding/image/video deployments that are filtered out of chat selectors.
