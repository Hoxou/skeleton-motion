---
title: Security and privacy
---

# Security and privacy

Skeleton Motion is local-first. The CLI reads target repositories without executing their code, importing modules, installing dependencies, or starting scripts. Build output, dependencies, VCS internals, environment files, secrets, and binary files are excluded from scanning.

For the future Studio:

- local paths are available only to the loopback companion;
- each job receives an explicit root and cannot traverse outside it;
- provider CLIs are spawned without a shell and retain their own authentication;
- planners receive sanitized evidence and must return schema-valid JSON;
- source text, tokens, and credentials are never stored in browser localStorage;
- localStorage is limited to preferences and a small job index;
- larger generated files remain on disk or in browser storage designed for blobs;
- localhost endpoints use an origin check and per-session capability token.

Public URL analysis remains subject to the target site's terms, robots policy, and access controls. Skeleton Motion does not bypass authentication.
