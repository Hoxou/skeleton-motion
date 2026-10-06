import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/args.js";

test("parses a single source and exact output controls", () => {
  const result = parseArgs([
    "../app",
    "--width", "1600",
    "--height", "900",
    "--theme", "dark",
    "--format", "svg,webm",
  ], "/tmp/project");

  assert.equal(result.source, "../app");
  assert.equal(result.width, 1600);
  assert.equal(result.height, 900);
  assert.equal(result.theme, "dark");
  assert.deepEqual(result.formats, ["svg", "webm"]);
});

test("rejects batch-style multiple sources", () => {
  assert.throws(() => parseArgs(["one", "two"]), /unexpected argument/);
});
