import assert from "node:assert/strict";
import test from "node:test";
import { createZip } from "../src/zip.js";

test("creates a UTF-8 store ZIP containing every named asset", () => {
  const zip = createZip([
    { data: "light", name: "flow.light.svg" },
    { data: "dark", name: "flow.dark.svg" },
  ], new Date("2026-01-02T03:04:06"));

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 14), 2);
  assert.match(zip.toString("utf8"), /flow\.light\.svg/);
  assert.match(zip.toString("utf8"), /flow\.dark\.svg/);
});
