// Named choreographies the story designer chooses from. Each is a mechanic,
// not a screen: the model keeps the move's steps and builds the screen from
// the product's own objects. Patterns are wordless and untoned on purpose:
// skeletons read better than text, untoned items take shades of the main
// color, and examples are what the model copies most. Every pattern is a complete, valid plan so the
// model sees the exact syntax, and each comes from a different made-up
// product so no single screen becomes the template.

export const MOVES = Object.freeze({
  approve: {
    hint: "an item is reviewed and approved: select it, act on it, and it turns done",
    plan: {
      copy: { description: "Pick the next request and sign it off.", eyebrow: "Reviews", title: "Approve in two clicks." },
      elements: {
        approve: { kind: "button" },
        detail: { kind: "panel" },
        "detail-bar-a": { kind: "bar" },
        "detail-bar-b": { kind: "bar" },
        "detail-title": { kind: "text" },
        queue: { kind: "panel" },
        "req-1": { kind: "row", state: "pending" },
        "req-2": { kind: "row" },
        "req-3": { kind: "row" },
      },
      label: "Approve request",
      screen: { children: [{ children: ["req-1", "req-2", "req-3"], id: "queue", type: "panel" }, { children: ["detail-title", "detail-bar-a", "detail-bar-b", "approve"], id: "detail", type: "panel" }], type: "row" },
      steps: [
        { by: { click: "req-1" }, do: [{ id: "req-1", op: "set", state: "selected" }] },
        { by: { click: "approve" }, do: [{ id: "approve", op: "set", state: "done" }, { id: "req-1", op: "set", state: "done" }] },
      ],
    },
  },
  compose: {
    hint: "something is written and sent: a field fills, the button is pressed, and the new item appears where it belongs, growing out of the button",
    plan: {
      copy: { description: "Write a note and it lands at the top of the thread.", eyebrow: "Notes", title: "Say it once." },
      elements: {
        composer: { kind: "panel" },
        note: { kind: "field" },
        "note-new": { kind: "card" },
        "note-a": { kind: "card" },
        "note-b": { kind: "card" },
        send: { kind: "button" },
        thread: { kind: "panel" },
      },
      label: "Post note",
      screen: { children: [{ children: ["note", "send"], direction: "row", id: "composer", type: "panel" }, { children: ["note-a", "note-b"], id: "thread", type: "panel" }], type: "column" },
      steps: [
        { by: { click: "note" }, do: [{ id: "note", op: "set", state: "focused", value: 0.7 }] },
        { by: { click: "send" }, do: [{ at: 0, from: "send", id: "note-new", into: "thread", op: "insert" }, { id: "note", op: "set", state: "idle", value: 0 }, { id: "note-new", op: "highlight" }] },
      ],
    },
  },
  connect: {
    hint: "two things get connected: a new node joins and a connector draws between them",
    plan: {
      copy: { description: "Add a step and wire it into the flow.", eyebrow: "Automations", title: "Connect the next step." },
      elements: {
        "add-step": { kind: "button" },
        "step-a": { kind: "card" },
        "step-b": { kind: "card" },
        "step-new": { kind: "card", state: "pending" },
        trigger: { kind: "chip", tone: "accent" },
      },
      label: "Add step",
      screen: { children: [{ children: ["trigger", "step-a", "step-b"], id: "flow", type: "column" }, { children: ["add-step"], id: "side", type: "column" }], type: "row" },
      steps: [
        { by: { click: "add-step" }, do: [{ from: "add-step", id: "step-new", into: "side", op: "insert" }, { from: "step-b", op: "link", to: "step-new" }] },
        { do: [{ id: "step-new", op: "set", state: "done" }, { from: "step-a", op: "link", to: "step-b" }] },
      ],
    },
  },
  filter: {
    hint: "a view narrows: a filter chip turns on and the items that do not match dim while the match stands out",
    plan: {
      copy: { description: "One tap and only the open listings stay in focus.", eyebrow: "Listings", title: "Find it faster." },
      elements: {
        "chip-all": { kind: "chip", state: "on" },
        "chip-open": { kind: "chip" },
        "chip-near": { kind: "chip" },
        "spot-a": { kind: "image" },
        "spot-b": { kind: "image" },
        "spot-c": { kind: "image" },
        "spot-d": { kind: "image" },
      },
      label: "Filter listings",
      screen: { children: [{ children: ["chip-all", "chip-open", "chip-near"], gap: "tight", type: "row" }, { children: ["spot-a", "spot-b"], type: "row" }, { children: ["spot-c", "spot-d"], type: "row" }], type: "column" },
      steps: [
        { by: { click: "chip-open" }, do: [{ id: "chip-open", op: "set", state: "on" }, { id: "chip-all", op: "set", state: "idle" }, { id: "spot-b", op: "set", state: "dim" }, { id: "spot-c", op: "set", state: "dim" }] },
        { by: { click: "spot-d" }, do: [{ id: "spot-d", op: "set", state: "selected" }] },
      ],
    },
  },
  progress: {
    hint: "the product works by itself: a metric or a job moves forward and lands on a result",
    plan: {
      copy: { description: "Deploys roll out and the error rate settles on its own.", eyebrow: "Releases", title: "Ship and watch it land." },
      elements: {
        "build-a": { kind: "row", value: 0.3 },
        "build-b": { kind: "row", value: 0.8 },
        builds: { kind: "panel" },
        health: { kind: "trend", value: 0.35 },
        status: { kind: "chip", state: "pending" },
      },
      label: "Roll out",
      screen: { children: [{ children: ["health", "status"], type: "column" }, { children: ["build-a", "build-b"], id: "builds", type: "panel" }], type: "row" },
      steps: [
        { do: [{ id: "build-a", op: "set", value: 1 }, { id: "health", op: "set", value: 0.75 }] },
        { do: [{ id: "build-a", op: "set", state: "done" }, { id: "status", op: "set", state: "done" }, { id: "health", op: "set", value: 1 }, { id: "health", op: "highlight" }] },
      ],
    },
  },
  reveal: {
    hint: "a list item opens its detail: select it and the detail side changes to its content",
    plan: {
      copy: { description: "Open a track and its details slide in beside the list.", eyebrow: "Library", title: "Everything about it, at a glance." },
      elements: {
        cover: { kind: "image" },
        detail: { kind: "panel" },
        "detail-bar": { kind: "bar" },
        "detail-title": { kind: "text" },
        library: { kind: "panel" },
        play: { kind: "toggle" },
        "track-a": { kind: "row" },
        "track-b": { kind: "row" },
        "track-c": { kind: "row" },
      },
      label: "Open track",
      screen: { children: [{ children: ["track-a", "track-b", "track-c"], id: "library", type: "panel" }, { children: ["detail-title", "detail-bar"], id: "detail", type: "panel" }], type: "row" },
      steps: [
        { by: { click: "track-b" }, do: [{ id: "track-b", op: "set", state: "selected" }, { at: 0, from: "track-b", id: "cover", into: "detail", op: "insert" }, { after: "detail-bar", id: "play", op: "insert" }] },
        { by: { click: "play" }, do: [{ id: "play", op: "set", state: "on" }] },
      ],
    },
  },
  stream: {
    hint: "new things arrive by themselves: entries slide in at the top and the newest one is marked",
    plan: {
      copy: { description: "Orders arrive live and the busiest one is flagged.", eyebrow: "Live orders", title: "Never miss an order." },
      elements: {
        feed: { kind: "panel" },
        "order-a": { kind: "row" },
        "order-b": { kind: "row" },
        "order-c": { kind: "row" },
        "order-new": { kind: "row" },
        "order-z": { kind: "row" },
        rush: { kind: "chip", tone: "accent" },
        today: { kind: "chart", value: 0.4 },
      },
      label: "Live orders",
      screen: { children: [{ children: ["order-a", "order-b", "order-z"], id: "feed", type: "panel" }, "today"], type: "row" },
      steps: [
        { do: [{ at: 0, id: "order-c", into: "feed", op: "insert" }, { id: "today", op: "set", value: 0.7 }] },
        { do: [{ at: 0, id: "order-new", into: "feed", op: "insert" }, { after: "order-new", id: "rush", op: "insert" }, { id: "today", op: "set", value: 1 }, { id: "order-new", op: "highlight" }] },
      ],
    },
  },
  triage: {
    hint: "work moves between stages: drag an item to its next column and it settles there",
    plan: {
      copy: { description: "Drag a ticket forward and the board makes room.", eyebrow: "Support", title: "Keep the queue moving." },
      elements: {
        doing: { kind: "panel" },
        "t-1": { kind: "card" },
        "t-2": { kind: "card" },
        "t-3": { kind: "card" },
        "t-4": { kind: "card" },
        todo: { kind: "panel" },
      },
      label: "Move ticket",
      screen: { children: [{ children: ["t-1", "t-2", "t-3"], id: "todo", type: "panel" }, { children: ["t-4"], id: "doing", type: "panel" }], type: "row" },
      steps: [
        { by: { drag: "t-2" }, do: [{ at: 0, id: "t-2", into: "doing", op: "move" }] },
        { by: { click: "t-2" }, do: [{ id: "t-2", op: "set", state: "done" }, { id: "t-2", op: "highlight" }] },
      ],
    },
  },
});
