---
title: Display Room
---

# Display Room

The Display Room is both a review surface and an embedding rehearsal. It uses the Skeleton Motion site header, a stage that shows the result, and a side panel with a **Scene** menu, an **Animation** menu, and a **Download ZIP** button. The scenes are:

- a Display presentation;
- Card, Split, and Bento placements;
- combined Story and Set views when several assets exist;
- a Formats view that shows the selected asset in every generated frame shape (16:9, 4:3, 1:1, 4:5, 9:16);
- light/dark switching from the header toggle.

The selected scene and animation are kept in the URL (`?scene=card&asset=insert-step`), so a specific view can be shared.

## Source styling is part of the result

The stage must look like the analyzed product; the header and panel around it always keep the Skeleton Motion look. The stage's background, foreground, surface, muted surface, border, accent, type stack, and control radius come from the generated palette and typography manifest. It must not substitute a generic gray showroom theme.

Theme switching uses the source's actual light and dark tokens. If a source has no evidenced dark mode, the analyzer records that limitation instead of inventing arbitrary colors.

The assets remain transparent. The Display Room may place them on the source background for evaluation, but the exported SVG does not paint that background. Source-specific texture is allowed only when it is recognizable product language—for example, a dot grid already used by the source.

Open the included qa-segnatura example in the [live Display Room](pathname:///qa-segnatura-motion-set.preview.html).
