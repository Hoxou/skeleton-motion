---
title: Display Room
---

# Display Room

The Display Room is both a review surface and an embedding rehearsal. It includes:

- a fullscreen presentation;
- Card, Split, and Bento placements;
- combined Story and Set views when several assets exist;
- light/dark switching and individual asset switching;
- one ZIP download for the whole set.

## Source styling is part of the result

The room must look like the analyzed product. Its page background, foreground, surface, muted surface, border, accent, type stack, and control radius come from the generated palette and typography manifest. It must not substitute a generic gray showroom theme.

Theme switching uses the source's actual light and dark tokens. If a source has no evidenced dark mode, the analyzer records that limitation instead of inventing arbitrary colors.

The assets remain transparent. The Display Room may place them on the source background for evaluation, but the exported SVG does not paint that background. Source-specific texture is allowed only when it is recognizable product language—for example, a dot grid already used by the source.

Open the included qa-segnatura example in the [live Display Room](pathname:///qa-segnatura-motion-set.preview.html).
