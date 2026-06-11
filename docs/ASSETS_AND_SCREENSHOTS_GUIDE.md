# Assets and Screenshots Guide

This guide explains the public presentation assets bundled with the Sentinel Coder One Studio repository and Marketplace documentation.

## Public-safe assets

The following assets are intended for GitHub/Marketplace documentation and product presentations:

- `docs/assets/paypal-donation-qr.png` - QR code for the public PayPal donation link.
- `docs/assets/sentinel-coder-enterprise-hero.png` - generated enterprise hero visual for docs and presentation use.
- `docs/assets/sentinel-coder-agentic-architecture.png` - architecture visual for Agentic/Profile explanations where present.
- `docs/assets/sentinel-coder-one-studio-pitch-deck.pptx` - presentation deck artifact.
- `docs/assets/sentinel-coder-one-studio-whitepaper.docx` - whitepaper document artifact.

The root `assets/docs/` folder may also contain Marketplace/package assets used by the extension package.

## Screenshot safety rules

Before adding screenshots to GitHub or Marketplace:

1. Hide API keys, bearer tokens, local secrets files, private endpoints, account IDs, and customer data.
2. Do not show your local VS Code user profile, private workspace paths, `.env` files, or provider dashboards with secrets.
3. Prefer generated mock UI imagery for marketing visuals when real screenshots would expose private data.
4. Keep images reasonably sized so the extension package remains lightweight.
5. Run a secret scan after adding images or docs.

## Generating new presentation visuals

Recommended prompt style:

> Professional enterprise software product illustration for an open-source VS Code AI coding extension. Show an abstract dark IDE interface, multi-provider model nodes, secure shield, cloud and local server icons, media generation panel, and agent orchestration graph. No readable text, no logos, no private data.

Avoid prompts that request copyrighted logos, private screenshots, real API keys, or customer content.

## Donation QR

The donation QR should encode only the public PayPal donation URL:

https://www.paypal.com/donate/?hosted_button_id=97VNNYCB3HWMS

If the QR is regenerated, verify that it does not include tracking tokens, secrets, or account-private data beyond the public donation URL.
