# Skeleton Motion

Generate one minimal, branded product-motion asset from a local codebase or webpage URL.

Tool scans source without executing it, ranks visual concepts, extracts light/dark design tokens, and renders one compact animated skeleton scene. Native output is animated SVG: sharper and smaller than GIF, responsive at any size, and suitable for landing pages. GIF, WebM, and MP4 are optional exports.

## Current scope

- One asset per command.
- Local repository or public HTTP(S) URL input.
- Automatic light/dark accent, surface, border, radius, and background extraction.
- Four scene types: flow, list, dashboard, editor.
- 3–5 major containers, little to no text, generous whitespace.
- Cursor, selection, progress, reveal, or chart-sweep motion.
- Shared visual grammar, varied choreography: camera, pointer, and emphasis are selected per story instead of applied globally.
- Exact `--width`, `--height`, and `--duration` controls.
- Analysis manifest explains selected concept and source evidence.

Batch generation is intentionally deferred. Future mode can use ranked concepts already stored in manifest to create a coordinated asset set.
The set should share palette, density, geometry, and line treatment while rotating motion profiles; zoom is reserved for moments that benefit from focus.

## Install

```bash
npm install
npm link
```

## Generate

```bash
skeleton-motion /path/to/repository \
  --out ./output \
  --width 720 \
  --height 405 \
  --theme auto \
  --format svg,html
```

`--theme auto` creates light and dark variants of one asset plus a preview that follows system theme.

URL input:

```bash
skeleton-motion https://example.com --out ./output
```

Override automatic concept selection:

```bash
skeleton-motion ../my-app --concept dashboard
```

## Output

```text
output/
  project-flow.light.svg
  project-flow.dark.svg
  project-flow.preview.html
  project-flow.manifest.json
```

SVG and preview work without extra system tools. Video and GIF exports use local Chrome plus FFmpeg:

```bash
brew install ffmpeg
skeleton-motion ../my-app --format svg,html,webm,mp4,gif
```

Set `CHROME_PATH` or `FFMPEG_PATH` when binaries are outside standard locations.

## Embed

Animated SVG:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/assets/project-flow.dark.svg">
  <img src="/assets/project-flow.light.svg" alt="Product workflow">
</picture>
```

Video fallback:

```html
<video autoplay muted loop playsinline>
  <source src="/assets/project-flow.dark.webm" type="video/webm">
  <source src="/assets/project-flow.dark.mp4" type="video/mp4">
</video>
```

## Safety

Target repositories are read-only. Scanner ignores generated/dependency directories and never imports source modules or runs project scripts.
