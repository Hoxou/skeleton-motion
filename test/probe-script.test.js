import assert from "node:assert/strict";
import test from "node:test";
import { PROBE_EXPRESSION } from "../worker/brand-probe.js";

// The probe ships as a string inside a template literal, where a single
// backslash silently disappears ("\s" becomes "s"). These checks read the
// regular expressions back out of the shipped string.
test("the shipped probe keeps its regex escapes", () => {
  assert.match(PROBE_EXPRESSION, /\.replace\(\/\\s\+\/g, " "\)/);
  assert.match(PROBE_EXPRESSION, /color\)\\\(\[\^\)\]\*\\\)\|#\[0-9a-f\]\{3,8\}\\b/);
});

test("the shipped probe parses as JavaScript", () => {
  assert.doesNotThrow(() => new Function(`return ${PROBE_EXPRESSION}`));
});
