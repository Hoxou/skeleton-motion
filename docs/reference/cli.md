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
| `--aspects <list>` | Frame shapes, comma-separated; default `16:9,4:3,1:1,4:5,9:16`. Any `W:H` is accepted |
| `--width <px>` | Exact width; with `--height`, renders one custom rectangle instead of the default shapes |
| `--height <px>` | Exact height; with `--width`, renders one custom rectangle instead of the default shapes |
| `--duration <seconds>` | Loop duration; defaults to a per-motion length so assets in a set never loop in lockstep |
| `--format <list>` | Comma-separated `svg`, `html`, `gif`, `webm`, `mp4` |
| `--name <slug>` | Override output basename |

`--width` sets the default embed size and the fallback stroke tier for renderers without CSS media queries. In browsers each SVG picks its stroke widths, cursor size, and level of detail from its actual rendered size, so one file stays sharp in a bento cell or a full-width hero.

`--theme auto` emits light and dark variants. `svg,html` is the portable default. Video and GIF formats require local Chrome and FFmpeg.
