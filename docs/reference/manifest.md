---
title: Manifest
---

# Manifest

Set generation emits schema version 2. The manifest records the normalized source analysis and every rendering decision.

```json
{
  "schemaVersion": 2,
  "analysis": {
    "source": "/path/or/url",
    "palettes": {
      "light": { "background": "#ffffff", "accent": "#2563eb" },
      "dark": { "background": "#111113", "accent": "#60a5fa" }
    }
  },
  "set": {
    "name": "project-motion-set",
    "preview": "project-motion-set.preview.html",
    "archive": "project-motion-set.assets.zip",
    "assets": []
  }
}
```

Every variant contains viewport, composition, palette, typography, backdrop, evidence, motion profile, physics, and semantic color assignments. The Display Room consumes those tokens directly; its source-styled background and controls are therefore reproducible rather than hard-coded.

Single-asset generation retains schema version 1 for compatibility.
