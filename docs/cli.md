---
sidebar_position: 4
title: CLI
description: Render animation sets from a terminal.
---

# CLI

The CLI renders Skeleton Motion's built-in animations offline from a public URL or a local repository, styled with that source's colors and type. Animations designed around your product's features are made on the [website](./website.md).

Requires Node.js 20 or later.

```bash
npx github:Hoxou/skeleton-motion https://your-site.com --set --name my-product --out ./motion
```

Open `./motion/my-product-motion-set.preview.html` to see the result.

## Usage

```text
skeleton-motion <url-or-repository-path> [options]
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--set` | Render a set of several animations | off |
| `--count <2-4>` | Animations in a set | `4` |
| `--name <slug>` | Base name for output files | from the source |
| `--out <dir>` | Output directory | `./skeleton-motion-output` |
| `--theme <mode>` | `auto` (light and dark), `light`, or `dark` | `auto` |
| `--aspects <list>` | Frame shapes, comma-separated; any `W:H` works | `16:9,4:3,1:1,4:5,9:16` |
| `--width <px>` `--height <px>` | One exact rectangle instead of the shapes | |
| `--duration <seconds>` | Loop length | per animation |
| `--format <list>` | `svg`, `html`, `gif`, `webm`, `mp4` | `svg,html` |
| `--help` | Show help | |

## Examples

```bash
# Light and dark set from a live site
npx github:Hoxou/skeleton-motion https://example.com --set --out ./motion

# Only wide and square shapes
npx github:Hoxou/skeleton-motion ../my-app --set --aspects 16:9,1:1

# Video for places that do not play SVG animation
npx github:Hoxou/skeleton-motion https://example.com --format svg,webm,mp4
```

`gif`, `webm`, and `mp4` need Google Chrome and FFmpeg installed (`brew install ffmpeg`).
