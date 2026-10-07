# AGENTS.md — Website design consistency

Rules for `website/src/pages/*` and their `.module.css` files. Read before
touching any page in the Docusaurus site. The goal is one visual system
across pages, not one-off styling per page.

## KISS and DRY — non-negotiable

- **DRY: there is exactly one navbar/header design — `SiteHeaderView.jsx` +
  `SiteHeader.module.css`.** `SiteHeaderView` has no Docusaurus imports;
  `SiteHeader.jsx` wires it to Docusaurus' `Link` and color mode, and the
  Display Room imports the same view with a plain `<a>` link. Every surface
  that needs that chrome imports it; never re-derive an "equivalent" header
  or copy its CSS into another file. Two implementations drift the moment
  one is touched (this happened: a hand-reinvented theme toggle in the old
  string-template room rendered both icons at once while the real
  `.themeToggle` was correct). The same applies to `buttons.module.css`
  and the `--home-*` tokens in `website/src/css/home-tokens.css`.
- **Display Room is a React app, not a template.** Source lives in
  `tools/preview-shell/` (Vite + React, Base UI `Select` for the pickers,
  CSS modules). `npm run build:preview-shell` bundles it and
  `scripts/sync-preview-shell.mjs` inlines the JS, CSS, and chrome font
  into the committed `src/preview-shell.html`, so the CLI ships one
  dependency-free file. The CLI only injects JSON (`src/room-data.js` via
  `src/preview.js`); it never generates markup. After a room change, run
  `node scripts/rebuild-previews.mjs` to refresh the example rooms. Never
  hand-edit `src/preview-shell.html`. `npm --prefix tools/preview-shell run
  dev` serves the room against the qa-segnatura example.
- **Display Room: only the stage is source-styled.** Header, panel, menus,
  page background, and chrome font always use the site's `--home-*` tokens
  and Instrument Sans. The source palette (`--page`, `--page-ink`,
  `--panel`, ...), font, and radius (`--scene-radius`) are set on the stage
  element only (`stageStyle` in `DisplayRoom.jsx`).
- **Prefer `font-*` longhands over the `font` shorthand in site CSS.**
  Docusaurus' CSS minifier drops shorthands like `font: 630 .92rem/1
  "Instrument Sans Variable", ...` ("Missing font size") and the element
  silently falls back to the browser default font.
- **KISS: the simplest correct version is the goal, not the cleverest.**
  If a fix needs a new abstraction, new token namespace, or a parallel
  system, stop and ask whether the existing one already covers it (it
  usually does — see "Before adding a new page or component" below).
  Prefer literally copying working code over re-architecting around it.

## Component source of truth

- All interactive controls (buttons, dialogs, form fields) come from
  `@base-ui/react` (`Button`, `Dialog`, `Field`, `Form`). Never reach for a
  raw `<button>`/`<input>` or a different UI library when a Base UI
  primitive covers the case.
- Buttons share a **base class + modifier class** pattern, not one bespoke
  class per button. The shared classes live in
  `website/src/components/buttons.module.css`:
  - `.actionButton` — shared shape/sizing/transition base.
  - `.createButton`, `.folderButton` — color overrides layered on top via a
    second class; page-specific overrides such as `.ctaButton` stay in the
    page's own module as a third class.
  - When adding a new button, extend this pattern:
    `className={`${buttons.actionButton} ${styles.yourVariant}`}`. Do not
    invent a parallel standalone class that re-declares `border`, `cursor`,
    `transition`, centering, etc. — that's how the hero/CTA button drift
    happened (two buttons, two unrelated class definitions, one quietly
    missing proper centering).
- `.actionButton` is `display:inline-flex; align-items:center;
  justify-content:center;` so button content centers predictably across
  browsers regardless of forced `min-height`. Keep that on the shared base,
  not duplicated per variant.

## Page chrome: the "floating" idea

- Docusaurus' real navbar is the default everywhere except the homepage.
  The homepage and Examples page hide it (`body:has(.skeleton-motion-home)
  .navbar { display: none; }` in `custom.css`) and render `<SiteHeader />`:
  `position: fixed`, transparent background, no card/surface behind it — it
  floats directly over content and fades out on scroll
  (`.siteHeaderHidden`).
- Any new full-bleed landing-style page that wants this effect should
  follow the same recipe: a fixed, `pointer-events: none` wrapper with
  `pointer-events: auto` children, not a sticky bar with a background
  surface. Don't give it a `background`/`box-shadow` — the "floating" look
  depends on content showing through.
- The icon-only theme toggle (`ThemeToggle` in `SiteHeaderView.jsx`) is a circular
  `.iconButton` (36px, `border-radius: 50%`, `background:
  var(--home-soft)`) living inside that same floating nav — same
  hover/focus treatment as the other nav controls, not a different widget
  style. At 820px and below the text links collapse into `BurgerMenu`
  (Base UI `Menu`), whose trigger is the same `.iconButton`; the theme
  toggle stays visible next to it.
- Dialogs, tiles, and CTA bands (`.dialogPopup`, `.tile`, `.finalCta`) all
  use large radii (`14px`–`28px`) and sit as distinct "cards" against a flat
  page background — nothing is flush/edge-to-edge except the page itself.

## Color & theme tokens

- Never hardcode a color that needs to flip between light/dark. Each page
  defines its own CSS custom properties on its root class (`.page` in
  `index.module.css` / `examples.module.css`: `--home-*`, `--examples-*`)
  and overrides them under `:global([data-theme="dark"]) .page { ... }`.
  Global tokens (`--ifm-color-primary`, `--motion-border`, `--motion-surface`,
  `--motion-ink`) live in `website/src/css/custom.css` the same way.
- New pages should declare their own `--<page>-*` token set rather than
  reusing another page's token names or writing raw hex values inline in
  JSX/CSS rules outside the `:root` / `[data-theme="dark"]` blocks.

## Light/dark asset pairs

- Any product screenshot/motion asset is shipped as a light SVG and a dark
  SVG, swapped purely with CSS, never JS: both `<img>`s render, one is
  hidden.
  ```css
  .darkAsset { display: none !important; }
  :global([data-theme="dark"]) .lightAsset { display: none !important; }
  :global([data-theme="dark"]) .darkAsset { display: block !important; }
  ```
  See `MotionPicture` in `index.jsx` and `ExampleTile` in `examples.jsx` —
  both wrap the pair in a `.assetThemePair` span. Reuse this exact pattern
  (prop names `light`/`dark`, same three CSS rules) for any new asset
  gallery instead of a `useColorMode()`-driven conditional render.

## Typography & motion

- Font is Instrument Sans Variable everywhere (`@fontsource-variable/
  instrument-sans`), imported per-page and declared in `--ifm-font-family-
  base`. Don't introduce a second font.
- Headings use tight negative letter-spacing (`-.045em` to `-.065em`) and
  sub-1 line-height — this is a deliberate house style, keep new headings
  consistent with the existing scale rather than browser defaults.
- Decorative motion (`asset-float` keyframes, hover lifts) must respect
  `@media (prefers-reduced-motion: reduce)` — every page with animation
  already has a reduced-motion block; copy it for new animated elements.

## Before adding a new page or component

1. Check if an existing class/token/pattern above already covers it.
2. If you must add a new CSS class, give it a base + modifier split like
   `.actionButton`/`.createButton`, not a one-off monolith.
3. If it needs light/dark behavior, use the token-override or
   asset-pair pattern above — not a runtime `useColorMode()` branch, unless
   the behavior genuinely can't be expressed in CSS (e.g. the color-mode
   toggle itself).

## Motion design principles — reference for improving `src/render-svg.js`

The animation engine (`src/render-svg.js`, `src/plan.js`, the invariants in
`docs/guides/asset-sets.md`) is a from-scratch SMIL/SVG implementation, not a
wrapper around an established animation library. That means motion-design
knowledge that's usually "built in" to a tool has to be deliberately encoded
here instead. This section distills four external references into guidance
for writing or reviewing stories. Treat it as a checklist when adding a new
story or motion profile, not as reading to do once.

Stories live in `src/compose/<story>.js`, one composer per motion, built on
`src/compose/kit.js` (type scale, stacking, backdrop) and
`src/compose/tracks.js` (keyframe tracks). The hand-placed scene functions
left in `render-svg.js` are legacy fallbacks; don't add new ones. Before
changing a composer, record it (`npm run audit:fill -- <dir>` plus a frame
strip) and compare with the previous output. Engine rules that are easy to
break:

- Items keep their source proportions and the shared type scale; regions
  fill by count, spacing, and container stretch, never by distorting items.
- Zoom, crop, and reveals are computed geometry. No `clipPath`, no
  `transform: scale` on content, no glow backdrops.
- Nothing pops on top of other content. If something replaces content
  (a picker in a frame too narrow to dock it), the content moves out first,
  the replacement moves in, then it leaves and the content moves back to its
  exact place. Each half is its own beat; never cross-fade them (see
  `insert-step`'s `navigate` arrangement and invariant 13).
- The pointer and the product take turns (invariant 14, enforced by
  `test/choreography.test.js`): travel while the UI is still, click, wait for
  the reaction to settle, then move. Put each press on its own beat with
  unpressed keys right before and after it; a press value on a shared key
  otherwise interpolates across the whole approach.
- A move is one segment between turning points. Every spline eases out to
  zero speed, so a keyframe in the middle of a one-direction move stalls it
  (this caused visible lag); `tracks.js` drops such keyframes, so author
  curves by their turning points only.

Sources (read in full before adding a new scene type):
- Aela, [*UI Animation: How to Create Motion Design*](https://aelaschool.com/en/interactiondesign/ui-animation-create-motion-design/)
- Infinum, [*Motion Design in UI Design*](https://infinum.com/blog/motion-design-ui-design/)
- Creative Bloq, [*Understand the 12 Principles of Animation*](https://www.creativebloq.com/advice/understand-the-12-principles-of-animation)
- Issara Willenskomer, [*Creating Usability with Motion: The UX in Motion Manifesto*](https://medium.com/ux-in-motion/creating-usability-with-motion-the-ux-in-motion-manifesto-a87a4584ddc)

### What this engine already encodes correctly

Cross-checking the current invariants (`docs/guides/asset-sets.md`) against
the sources above — these are already consistent, keep them this way:

- **Invariant 1** ("clicks answer immediately") = UX in Motion's
  *Expectation* pillar and Disney's *Anticipation* — every `cursor()` click
  in `flowScene`/`listScene` has a same-target state change, not a delayed
  or decoupled one.
- **Invariant 2** ("inserting opens space before the object settles") =
  Disney's *Anticipation* + *Staging* — space opening is the anticipatory
  beat that stages the insertion so it reads as caused, not as a cut.
  Willenskomer's *Offset & Delay* principle is the same idea applied to
  object relationships: stagger two objects' timing to tell the user they're
  separate before the user consciously parses the layout.
- **Invariant 4** ("gentle, distance-aware easing, restrained follow-
  through") = Disney's *Slow In/Slow Out* and *Follow Through and
  Overlapping Action*, and Willenskomer's Principle 1 (*Easing*) almost
  word-for-word. `MOTION_EASING`/`easingSegments()` is the mechanism; this
  is why a scene should never use `calcMode="linear"` for a position/scale
  change (linear motion is only acceptable for a pure mode/status change —
  see Aela's note that linear easing is fine for *state* changes but wrong
  for *position* changes).
- **Invariant 5** ("opacity and color settle without overshoot") = a
  deliberate, documented deviation from Disney's *Exaggeration* and from
  Jitter.video-style spring bounce — correct for this engine, because
  overshoot on a *settle* reads as imprecision in a product UI, not
  personality. Keep exaggeration (if ever used) confined to scale/position
  anticipation beats, never to a final settle value.
- **Invariant 7** (reduced-motion safety) and the `.lod-fine`/`.lod-texture`
  responsive hide rules are this engine's answer to Aela's *Responsiveness*
  and *Awareness* characteristics — motion must adapt to the viewer's
  context (motion preference, viewport size), not assume one environment.
- **Invariant 8** (3-5 major elements, no redundant nested plates) is
  Disney's *Staging* applied to density: staging is "composition that
  guides the eye," and a cluttered scene has no staging left to do.

### Opportunities not yet used — consider for new scenes

These are legitimate, usability-grounded techniques from the sources above
that the current four scene functions don't exploit. Reach for them before
inventing a new ad-hoc animation idiom:

- **Parenting** (Willenskomer #3): link one object's property to another's
  so a dependent relationship reads clearly — e.g. a swatch chip's selection
  ring scaling in sync with the canvas shape's color settle, rather than two
  independent `<animate>` blocks that happen to overlap in time.
- **Masking / Overlay** (Willenskomer #6-7): when a detail is logically
  "already there, just occluded", reveal it by moving the occluding layer
  (a card pulling back, a row lifting over another) rather than a scale-pop.
  Do it with computed geometry, not `clip-path`: clipped edges break the
  fill and stroke rules above.
- **Secondary action** (Disney #8): a small, subordinate motion that
  supports the hero action without competing with it — e.g. a subtle
  label-opacity shift on the row *next to* the one being selected, so the
  selection reads as a choice among siblings, not an isolated event.
- **Arc** (Disney #7): `cursor()`'s `animateTransform` paths are currently
  straight-line interpolations between points (SMIL `keySplines` only ease
  the *timing*, not the *path*). A pointer or dragged-object path that
  curves slightly (via an intermediate keyframe) reads as more physically
  grounded than a straight line, especially for anything framed as "drag."
- **Value Change** (Willenskomer #5): numeric/text content changing in
  place (not just shape/color) is a distinct, currently-unused technique —
  relevant for any future dashboard-style scene showing a metric update.

### Numeric guidance to sanity-check against, not hard rules

Aela's duration bands (optimal UI animation: 200-500ms; under 100ms is
imperceptible; web transitions commonly 150-200ms; mobile 200-300ms; larger
objects should move slower than small ones) are a sanity check for any new
`scene.duration`/`MOTION_TIMING` value in `src/plan.js`, not a hard
constraint — this engine's loops are longer, ambient, looping
demonstrations rather than one-shot UI transitions, so the per-*beat*
timing (the gap between two `keyTimes` entries) is the more relevant number
to check against these bands, not the total loop duration.

### Before writing a new scene function

1. Name which of the 12 Disney principles and which of the 12 UX-in-Motion
   principles the hero action is actually using. If you can't name one,
   the motion is probably decorative (Aela's 4th animation type) — fine for
   a backdrop, not for a hero action.
2. Write the asset's `copy.title`/`copy.description` *before* animating —
   if the copy can't describe what moves and why in one sentence, the scene
   doesn't have a clear hero action yet (Disney's *Staging*: motion is
   either the main point of the frame or it's noise).
3. Run it past the existing 8 invariants in `docs/guides/asset-sets.md`
   before adding it to the dispatch in `render-svg.js`.
