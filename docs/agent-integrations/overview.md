---
title: Local AI adapters
---

# Local AI adapters

The deterministic engine can already analyze and render a set. An optional planner can make story selection more product-specific by interpreting the sanitized evidence the analyzer provides.

The planned local Studio has three parts:

1. a browser UI served from localhost;
2. a small companion process that can read an explicitly selected repository and run the generator;
3. an adapter that invokes an existing Codex or Claude Code CLI as a child process.

The public documentation site cannot read local paths or start these tools. When a user enters a local path there, it explains how to start the companion instead of pretending the browser has filesystem access.

Adapters receive a compact manifest, not an unrestricted copy of source code. They must return data matching a strict versioned JSON schema. The companion uses argument arrays rather than a shell, applies time and output limits, and keeps credentials in the provider's own login store.

API keys are optional. A hosted/API fallback may be added later, but local authenticated CLIs and local open-source models are the preferred zero-incremental-cost paths.
