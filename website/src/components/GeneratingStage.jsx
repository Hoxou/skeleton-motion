import React, { useEffect, useState } from "react";
import styles from "./GeneratingStage.module.css";

const QUIPS = [
  "Reading the room (and the CSS)",
  "Sampling your brand's favorite blue",
  "Teaching buttons to bow",
  "Negotiating with the easing curves",
  "Untangling bezier handles",
  "Bribing the skeleton loaders",
  "Asking the cursor where it wants to go",
  "Warming up the spring physics",
  "Rehearsing the first click",
  "Convincing the logo to hold still",
  "Reticulating keyframes",
  "Counting pixels twice, to be safe",
  "Choreographing a tasteful entrance",
  "Polishing the sixtieth frame",
  "Giving every div a little stage presence",
  "Summoning a coordinated motion set",
];

const QUIP_MS = 2000;

function shuffled(items) {
  return items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function hostOf(source) {
  try {
    return new URL(source).host || source;
  } catch {
    return source;
  }
}

export default function GeneratingStage({ source }) {
  const [quips] = useState(() => shuffled(QUIPS));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % quips.length), QUIP_MS);
    return () => window.clearInterval(timer);
  }, [quips]);

  return (
    <section className={styles.stage}>
      {/* Remounting on key restarts the entrance animation for each quip. */}
      <p className={styles.quip} key={index} aria-hidden="true">
        {quips[index]}
      </p>
      <p className={styles.note} role="status">
        Designing motion for <strong>{hostOf(source)}</strong>. This can take a minute.
      </p>
    </section>
  );
}
