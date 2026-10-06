---
title: Embed assets
---

# Embed generated assets

Use the generated light and dark SVGs with a picture element:

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="/assets/project.insert-step.dark.svg"
  />
  <img
    src="/assets/project.insert-step.light.svg"
    alt="A new workflow step appears between two existing steps"
  />
</picture>
```

The SVG background is transparent, so put it directly in the page, inside a feature card, or next to editorial copy. Let the host page control the surrounding color and padding.

For email or platforms that do not support animated SVG, request `gif`, `webm`, or `mp4` with `--format`. WebM is usually a better web fallback than GIF because it preserves smooth motion at a much smaller size.
