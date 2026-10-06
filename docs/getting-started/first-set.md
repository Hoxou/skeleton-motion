---
title: Generate your first set
---

# Generate your first set

Skeleton Motion requires Node.js 20 or newer.

```bash
git clone https://github.com/Hoxou/skeleton-motion.git
cd skeleton-motion
npm install
npm link
```

Generate four coordinated assets from a local repository:

```bash
skeleton-motion /absolute/path/to/project \
  --set \
  --count 4 \
  --width 720 \
  --height 405 \
  --theme auto \
  --out ./motion-assets
```

Or analyze a public page:

```bash
skeleton-motion https://example.com --set --out ./motion-assets
```

The output includes light and dark SVG variants, one Display Room, a versioned JSON manifest, and a ZIP containing the complete set. Animated SVG is the native format because it stays crisp, small, transparent, and responsive. GIF, WebM, and MP4 exports are optional and require Chrome plus FFmpeg.

Use `--count 2`, `3`, or `4` to control the set size. Omit `--set` to generate one asset for testing.
