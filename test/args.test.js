import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/args.js";
import { resolveFormats } from "../src/layout/formats.js";

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

test("enables coordinated set generation", () => {
  const result = parseArgs(["../app", "--set", "--count", "3"], "/tmp/project");

  assert.equal(result.set, true);
  assert.equal(result.count, 3);
  assert.throws(() => parseArgs(["../app", "--set", "--count", "5"]), /integer from 2 to 4/);
});

test("generates every default frame shape unless shapes or an exact size are given", () => {
  assert.deepEqual(resolveFormats(parseArgs(["../app"])).map((format) => format.id), ["16:9", "4:3", "1:1", "4:5", "9:16"]);
  assert.deepEqual(resolveFormats(parseArgs(["../app", "--aspects", "1:1,9:16,1:1"])).map((format) => format.id), ["1:1", "9:16"]);

  const [custom] = resolveFormats(parseArgs(["../app", "--width", "1000", "--height", "1000"]));
  assert.equal(custom.layout, "square");
  assert.deepEqual(custom.viewport, { height: 1000, width: 1000 });
  assert.throws(() => parseArgs(["../app", "--aspects", "wide"]), /unsupported aspect/);
});
