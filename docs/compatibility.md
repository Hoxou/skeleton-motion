---
sidebar_position: 5
title: Compatibility
description: Where the animations and code run.
---

# Compatibility

## Browsers

The animations are SVG with built-in (SMIL) animation and play in current Chrome, Edge, Firefox, and Safari, on desktop and mobile. They have transparent backgrounds and scale to any size without blurring.

With the React or HTML component, visitors who turn on **reduce motion** in their system settings see a still frame. Plain SVG files from the ZIP always animate.

## Code

| Format | Works with |
| --- | --- |
| React component | React 16.8 or later. Next.js App Router included (the file starts with `"use client"`), as well as Pages Router, Vite, Remix, Astro islands, and Gatsby. |
| HTML element | Any page that runs JavaScript modules: plain HTML, Webflow and Framer embeds, WordPress, Vue, Svelte, Angular. |
| Plain SVG | Anywhere an image works. |

Both components need `ResizeObserver` and `matchMedia`, which every current browser has.

## Where animation does not play

Email clients and some site builders show SVG as a still image. Use the CLI's `webm` or `mp4` output there; WebM is usually smaller than GIF.

## CLI

Node.js 20 or later on macOS, Linux, or Windows. Video and GIF output also need Google Chrome and FFmpeg.
