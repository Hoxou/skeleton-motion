---
title: Costs and hosting
---

# Costs and hosting

The current CLI and GitHub Pages documentation need no paid backend. Local Codex, Claude Code, Ollama, or LM Studio adapters can reuse tools a user already operates, while deterministic scraping and rendering handle most of the workload.

If a hosted service is added, the intended budget is at most about $5 per month at small scale:

- static application and docs on GitHub Pages;
- Cloudflare Workers for a small API;
- D1 for generation metadata;
- R2 for expiring animation archives;
- strict retention, size, and per-user generation limits;
- an inexpensive structured-output model only for the compact planning step.

Cloudflare currently documents free allocations for [D1](https://developers.cloudflare.com/d1/platform/pricing/) and [R2](https://developers.cloudflare.com/r2/pricing/), while [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) starts at $5 per month. These prices and quotas can change, so the hosted implementation must check current pricing before launch.

The hosted roadmap separates metadata from large artifacts and makes retention explicit. A generated archive is temporary unless a user chooses to keep it.
