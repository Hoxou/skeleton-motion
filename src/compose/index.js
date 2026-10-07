import { composeAssignColor } from "./assign-color.js";
import { composeConfirmEdit } from "./confirm-edit.js";
import { composeInsertStep } from "./insert-step.js";
import { composePlan } from "./plan.js";
import { composeProgressSignal } from "./progress-signal.js";
import { composeSelectItem } from "./select-item.js";
import { composeSnapToGrid } from "./snap-to-grid.js";
import { composeVoiceTask } from "./voice-task.js";

// Motions rebuilt on the layout kit. They render natively in every format
// with the shared type scale; anything else falls back to the fixed 16:9
// scenes in render-svg.js.
const COMPOSERS = Object.freeze({
  "add-step": composeInsertStep,
  "assign-color": composeAssignColor,
  "chart-sweep": composeProgressSignal,
  "focus-and-confirm": composeConfirmEdit,
  // Model-authored scene plans, one generic composer for any product story.
  plan: composePlan,
  "select-and-reveal": composeSelectItem,
  "snap-to-grid": composeSnapToGrid,
  "voice-to-task": composeVoiceTask,
});

export function isComposedMotion(name) {
  return Object.hasOwn(COMPOSERS, name);
}

export function composeScene(scene) {
  return COMPOSERS[scene.motion](scene);
}
