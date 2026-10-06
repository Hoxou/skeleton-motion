---
title: Claude Code
---

# Claude Code adapter

The proposed Claude Code adapter uses headless print mode, restricted tools, no session persistence, and schema-constrained output.

```bash
claude --restricted \
  -p \
  --tools "" \
  --disallowedTools "mcp__*" \
  --no-session-persistence \
  --max-turns 1 \
  --output-format json \
  --json-schema '{ ... }' \
  'Plan the motion stories from this sanitized manifest.'
```

Users authenticate through Claude Code itself. The web UI never asks for or stores a provider token.

See the official [CLI reference](https://code.claude.com/docs/en/cli-reference), [headless mode](https://code.claude.com/docs/en/headless), and [authentication guide](https://code.claude.com/docs/en/authentication).
