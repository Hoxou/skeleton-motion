---
sidebar_position: 3
title: Use the code
description: Add an animation to your site as a React component, an HTML element, or plain SVG.
---

# Use the code

In the Display Room, pick an animation and press **Copy code** (or **Download**). Each file is self-contained: every frame shape in light and dark, no dependencies besides React for the React version.

The component shows the frame shape closest to its box, follows the visitor's color scheme, and shows a still frame to visitors who turn on reduce motion.

## React

Save the file next to your components, for example `InsertStep.jsx`, then:

```jsx
import InsertStep from "./InsertStep";

export function Feature() {
  return <InsertStep style={{ width: "100%" }} />;
}
```

| Prop | Values | Default |
| --- | --- | --- |
| `aspect` | `auto`, or one shape such as `16:9`, `4:3`, `1:1`, `4:5`, `9:16` | `auto` |
| `theme` | `auto`, `light`, `dark` | `auto` |
| `alt` | Text for screen readers | the animation's headline |
| `className`, `style` | Passed to the wrapper | |

Give the wrapper a width; its height follows the chosen shape. Give it a height too and the closest shape is picked for that box.

## HTML

Paste the snippet anywhere in your page. It defines one custom element and needs no build step:

```html
<skeleton-motion-insert-step theme="auto" style="display: block; width: 100%"></skeleton-motion-insert-step>
<script type="module">/* copied code */</script>
```

The element takes the same `aspect` and `theme` attributes.

## Plain SVG

From the ZIP, use the light and dark files with a `picture` element:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/motion/product.insert-step.dark.svg" />
  <img src="/motion/product.insert-step.light.svg" alt="A new step appears between two existing steps" />
</picture>
```

File names carry the shape (`.4x5.`, `.9x16.`); files without a shape suffix are 16:9.

## ZIP contents

| File | Purpose |
| --- | --- |
| `*.light.svg`, `*.dark.svg` | One animation per shape and theme |
| `*.preview.html` | The Display Room, viewable offline |
| `*.manifest.json` | List of every file with its shape and theme |
