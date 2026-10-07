import React from "react";
import { Button } from "@base-ui/react/button";
import select from "./RoomSelect.module.css";

const ASPECT = /^(\d+):(\d+)$/;

// Outline of the current frame shape, fitted inside a 14px box.
function FrameIcon({ aspect }) {
  const [, w = 1, h = 1] = aspect.match(ASPECT) || [];
  const scale = 12 / Math.max(Number(w), Number(h));
  const width = Number(w) * scale;
  const height = Number(h) * scale;
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <rect x={(14 - width) / 2} y={(14 - height) / 2} width={width} height={height} rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Cycles through `aspects` (e.g. ["16:9", "1:1"]) on each press. */
export default function AspectButton({ aspects, disabled = false, onChange, value }) {
  const next = aspects[(aspects.indexOf(value) + 1) % aspects.length];
  return (
    <div className={select.field}>
      <span className={select.label} aria-hidden="true">Aspect ratio</span>
      <Button
        className={select.trigger}
        aria-label={`Aspect ratio ${value}, switch to ${next}`}
        disabled={disabled}
        onClick={() => onChange(next)}
        type="button"
      >
        <span className={select.value}>{value}</span>
        <span className={select.icon}><FrameIcon aspect={value} /></span>
      </Button>
    </div>
  );
}
