---
title: Codex CLI
---

# Codex CLI adapter

The proposed adapter uses Codex's non-interactive execution mode, read-only sandbox, ephemeral sessions, and structured output.

```bash
codex login status
codex exec \
  -C /controlled/job/directory \
  --sandbox read-only \
  --ephemeral \
  --skip-git-repo-check \
  --json \
  --output-schema ./scene-plan.schema.json \
  --output-last-message ./scene-plan.json \
  -
```

The companion will spawn this command directly with `shell: false`, stream the prompt through stdin, and validate the returned plan before rendering anything.

See the official [Codex CLI reference](https://developers.openai.com/codex/cli/reference) and [authentication guide](https://developers.openai.com/codex/auth).
