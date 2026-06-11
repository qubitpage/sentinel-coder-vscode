# Sentinel Coder One Studio Pitch Deck

![Sentinel Coder One Studio enterprise hero](assets/sentinel-coder-enterprise-hero.png)

## Slide 1 - The developer AI workspace is fragmented

Developers use many disconnected tools:

- Chat assistants.
- Code editors.
- Terminal automation.
- Provider dashboards.
- Media generators.
- Documentation tools.
- Security scanners.
- Remote/cloud environments.

This fragmentation slows teams and increases security risk.

## Slide 2 - Sentinel Coder One Studio

Sentinel Coder One Studio brings AI coding, model orchestration, and media/document workflows into Visual Studio Code.

Core promise:

> Use one model directly when that is best. Use explicit Agentic Profiles when multi-model orchestration adds value.

## Slide 3 - Why now

The AI model market is moving fast:

- New Azure/OpenAI/Grok/Groq/OpenRouter models appear frequently.
- Context windows and supported operations change.
- Some models support tools; others reject tool parameters.
- Cost can explode if long context is used carelessly.

Sentinel responds with live model discovery, dynamic context metadata, and operation-aware routing.

## Slide 4 - Product capabilities

- Multi-provider model selector.
- Agentic Profiles with main, worker, and reviewer models.
- Cost-aware orchestration.
- Terminal, file, Git, Docker, SSH, HTTP, RAG, and firewall tools in Desktop.
- VS Code Web-compatible extension entry point.
- Remote Tool Bridge path for browser workflows.
- Media and Document Studio for images, video, audio, reports, and presentations.

## Slide 5 - Enterprise safety

Enterprise-grade controls:

- Secret-free setup guidance.
- VS Code SecretStorage/environment variable patterns.
- Security/firewall scans before publish.
- Webview hardening.
- Package hygiene with source/tests/scripts excluded.
- Approval modes for tools.
- Desktop vs Web capability clarity.

## Slide 6 - Agentic Profiles

Agentic Profiles make orchestration repeatable:

- Main orchestrator model.
- Worker pool.
- Reviewer pool.
- Max parallelism.
- Cost policy.
- Premium worker policy.
- Profile-specific instructions.

Examples:

- Free-only exploration profile.
- Azure cost-smart production profile.
- Multi-provider elite review profile.
- Local/private coding profile.

## Slide 7 - Cost strategy

A cost-smart setup avoids using the most expensive model for every step.

Recommended pattern:

1. Strong but affordable daily orchestrator.
2. Cheap/free workers for extraction and drafts.
3. Different-model reviewer for hard critique.
4. Premium long-context model for final review only when needed.
5. Visible model usage telemetry.

## Slide 8 - VS Code Web and remote future

Browser mode cannot directly run local terminals, Docker, SSH, local Ollama, or native MCP tools.

Sentinel's strategy:

- Browser-safe extension entry.
- Clear capability reporting.
- Optional authenticated Remote Tool Bridge for approved remote execution.
- Desktop mode for unrestricted local automation.

## Slide 9 - Open-source community

Sentinel Coder One Studio is open source and contribution-friendly.

- Repository: https://github.com/qubitpage/sentinel-coder-vscode
- Issues: https://github.com/qubitpage/sentinel-coder-vscode/issues
- Contributing guide: ../CONTRIBUTING.md

Community contributions can improve provider support, Agentic Profiles, docs, security, accessibility, and web compatibility.

## Slide 10 - Support the project

If Sentinel helps your work and you want to support frequent updates, any amount is useful to sustain development.

Donations help keep the project open source, maintained, and improving.

- PayPal: https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS

![PayPal donation QR](assets/paypal-donation-qr.png)
