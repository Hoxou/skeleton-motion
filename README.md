# Skeleton Motion

Generate one minimal, branded product-motion asset from a local codebase or webpage URL.

Tool scans source without executing it, ranks visual concepts, extracts light/dark design tokens, and renders one compact animated skeleton scene. Native output is animated SVG: sharper and smaller than GIF, responsive at any size, and suitable for landing pages. GIF, WebM, and MP4 are optional exports.

## Current scope

- One asset per command.
- Local repository or public HTTP(S) URL input.
- Automatic light/dark accent, surface, border, radius, background, and typography extraction.
- Concept-scoped monochrome versus multicolor detection, with reusable accent and pastel tag roles derived from colors the relevant UI actually uses.
- Four scene types: flow, list, dashboard, editor.
- 3–5 major containers, little to no text, generous whitespace.
- Cursor, selection, progress, reveal, or chart-sweep motion.
- Shared visual grammar, varied choreography: camera, pointer, and emphasis are selected per story instead of applied globally.
- Exact `--width`, `--height`, and `--duration` controls.
- Analysis manifest explains selected concept and source evidence.
- Display preview with light/dark switching, asset switching, ZIP download, and Display, Card, Split, and Bento landing-page contexts.

Batch generation is intentionally deferred. The preview and manifest already model a coordinated asset set, including a combined alternating Story scene when multiple assets are supplied.
The set should share palette, density, geometry, and line treatment while rotating motion profiles; zoom is reserved for moments that benefit from focus.

## Motion rules

- Model meaningful before/after layouts. Insertion moves existing objects apart before the new object settles into the opened space.
- Every authored click must cause an immediate response on its target: a pressed state, highlight, selection, reveal, or layout change. A cursor ripple alone is not interaction feedback.
- Treat live activity such as speaking, recording, syncing, or collaboration as a continuous motion layer. Let the ambient signal keep moving while the resulting state change overlaps it.
- Use serial “then this, then this” choreography only when the product story is genuinely sequential. Otherwise combine ambient, spatial, and feedback layers so the loop has more than one rhythm.
- When an icon-only confirmation would undersell the action, animate a meaningful major container change such as reordering, opening space, moving between groups, or resizing. This is a story choice, not a requirement for every asset.
- Give each asset one clear hero motion that attracts the eye. Choose from scrolling, zooming, expansion, travel or bounce, reordering, or another source-appropriate focal change; keep supporting motion quieter.
- Preserve energy and identity through the loop: use a small anticipation before the hero action, carry direction from source to result, then allow one restrained follow-through before settling.
- Use spatial easing for position, scale, and geometry, with a controlled overshoot when the visual language permits it. Color and opacity effects should settle without overshoot.
- Keep related motion physically coherent. Connected elements should share direction, timing, and apparent weight; larger or farther travel gets more time than a local state change.
- Assign colors by meaning, not by sequence: continuous signals use one stable color, confirmation uses the primary interaction color, and extra palette colors are reserved for genuinely distinct categories or entities.
- Never animate a stroke from zero length. Keep connector geometry valid and reveal complete segments with opacity or a non-zero clip.
- Use motion tokens by role: gentle spring-like settling for layout, quick easing for direct feedback, and smooth in/out travel for pointers.
- Add only slight overshoot to primary movement. Supporting motion should stay quiet and should not repeat every effect used elsewhere in the set.
- Keep every generated asset transparent and floating by default. Detecting a canvas color only makes it available as a palette role; the exporter never paints a solid artboard behind the animation.
- Treat any emitted backdrop as an explicit art-direction choice. Add a source-specific texture such as a dot grid only when it contributes recognizable product personality, and keep the texture itself transparent so the embedding page still owns the background color.
- Assume landing pages will place assets inside cards or sections. Do not add an automatic outer plate around the animation and avoid redundant containers inside containers.

The motion model follows established interface-animation guidance: [Material motion physics](https://m3.material.io/styles/motion) for separate spatial/effect springs, [Carbon motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview) for productive versus expressive moments and distance-aware duration, [Fluent motion](https://fluent2.microsoft.design/motion) for physical continuity, and [Apple motion](https://developer.apple.com/design/human-interface-guidelines/motion) for purposeful feedback and reduced-motion safety.

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
  project-flow.preview-font.ttf
  project-flow.manifest.json
  project-flow.assets.zip
```

The copied preview font is included only when a matching local font file is found. The ZIP contains every generated asset, the preview, its manifest, and the preview font when present.

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
