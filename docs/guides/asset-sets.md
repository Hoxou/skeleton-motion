---
title: Asset sets and motion grammar
---

# Asset sets and motion grammar

import useBaseUrl from "@docusaurus/useBaseUrl";

A set shares the source's palette, geometry, line treatment, and visual density. It does not repeat one animation template four times.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset={useBaseUrl("/img/skeleton-motion-studio-set.snap-to-grid.dark.svg")} />
  <img src={useBaseUrl("/img/skeleton-motion-studio-set.snap-to-grid.light.svg")} alt="Guides appear as the shape travels and fade once it settles into the grid." />
</picture>

Each asset gets one hero action—a reordering, scroll, zoom, expansion, travel, bounce, or another source-appropriate change. Supporting motion remains quieter. Live activity such as speaking, recording, or syncing can continue while the hero change happens, rather than waiting in a rigid sequence.

The engine applies these invariants:

1. clicks answer immediately with pressed, highlighted, selected, or revealed state;
2. inserting an object opens physical space before the object settles;
3. major containers move only when that motion tells the product story;
4. spatial motion uses gentle, distance-aware easing and restrained follow-through;
5. opacity and color settle without overshoot;
6. connectors never animate from invalid zero-length geometry;
7. reduced-motion preferences remain usable;
8. assets use three to five major elements and avoid redundant nested plates;
9. every region stays full at every instant its content is settled: shapes resize and move as computed layouts, so no edge strip goes blank while things enter, leave, or reorder; a group fading as a whole during a handoff (invariant 13) is between states, not settled;
10. zoom and crop are computed geometry, never clip masks; shapes stay fully inside their region, and overshoot happens between shapes while the outer edges stay pinned;
11. items keep their source proportions and one shared type scale: rows and cards have a natural height and stretch only where the product would, so a row reads the same size in every asset and format, and regions fill through count, spacing, and container stretch rather than distortion;
12. a set shares one palette, radius, and backdrop, and each story keeps a small cast; a larger frame changes the arrangement (side by side, stacked, navigate, strip), not the number of things on screen;
13. nothing pops on top of content it replaces: when a frame is too small to show both, what leaves moves out completely before what arrives moves in, and when the replacement is done it leaves the same way and the original content moves back to exactly where it was;
14. the pointer and the product take turns: the pointer travels only while the UI is still, hovers or presses its target, and waits for the reaction to settle before moving again; a press is a short dip at the click, not a slow squeeze during the approach; the pointer fades out where it stopped before the loop resets. Only ambient activity (`data-ambient`) and a dragged object with its guides (`data-drag`) move with the pointer.

Composed stories render natively for each frame shape (16:9, 4:3, 1:1, 4:5, 9:16). Each shape gets its own arrangement and timing for the same story rather than a resize. Run `npm run audit:fill -- <dir>` to check rendered region fill in Chrome.

Combined Story and Set scenes show whether the family remains coherent when several assets appear on one landing page.
