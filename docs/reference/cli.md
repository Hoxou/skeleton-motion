---
title: CLI reference
---

# CLI reference

```text
skeleton-motion <source> [options]
```

`source` is an absolute or relative repository path, or a public HTTP(S) URL.

| Option | Meaning |
| --- | --- |
| `--out <path>` | Output directory |
| `--set` | Generate a coordinated asset set |
| `--count <2..4>` | Number of assets in a set; default 4 |
| `--concept <kind>` | Prefer `flow`, `list`, `dashboard`, or `editor` |
| `--theme <mode>` | `auto`, `light`, or `dark` |
| `--width <px>` | SVG viewport width |
| `--height <px>` | SVG viewport height |
| `--duration <seconds>` | Loop duration |
| `--format <list>` | Comma-separated `svg`, `html`, `gif`, `webm`, `mp4` |
| `--name <slug>` | Override output basename |

`--theme auto` emits light and dark variants. `svg,html` is the portable default. Video and GIF formats require local Chrome and FFmpeg.
