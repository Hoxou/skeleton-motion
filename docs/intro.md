---
sidebar_position: 1
slug: /
title: Skeleton Motion
description: Product-aware motion assets for landing pages.
---

# Motion assets that belong to the product

Skeleton Motion turns a local repository or public webpage into a coordinated set of small, looped landing-page animations. It extracts the source's visual language, identifies useful product moments, and renders transparent animated SVGs with light and dark variants.

The current engine is deterministic and local-first. It scans source without running project code, creates up to four assets, and packages them with a manifest, a source-styled Display Room, and a ZIP download.

```bash
npm install
npm link
skeleton-motion /path/to/project --set --out ./motion-assets
```

The eventual Studio will accept a path or URL in a browser-like interface and delegate product-story planning to a Codex or Claude Code installation already authenticated on the user's machine. No provider account or hosted backend is required for the local workflow.

## Design principles

- **Source-aware.** Palette, theme, type, geometry, density, and decorative treatments come from evidence in the product.
- **Useful at card size.** A few large elements, generous space, and one legible hero action beat screenshot-level detail.
- **Different stories, one family.** Assets share styling but vary their choreography, camera, and interaction.
- **Transparent by default.** The embedding page owns the canvas. A backdrop appears only when it is recognizable product language.
- **Every click answers.** A click always produces immediate target feedback and a meaningful change.
- **Motion has weight.** Anticipation, energy transfer, follow-through, and distance-aware timing keep loops coherent.

Continue with [your first generated set](./getting-started/first-set.md).
