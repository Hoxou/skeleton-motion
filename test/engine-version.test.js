import assert from "node:assert/strict";
import test from "node:test";
import { nextRelease, releaseNumbers, versionIdFor } from "../scripts/engine-version.mjs";

test("the first versioned deploy follows the untagged v1 engine", () => {
  assert.equal(nextRelease([]), 2);
});

test("releases count numerically and ignore unrelated tags", () => {
  const tags = ["engine-v2", "engine-v10", "engine-v9", "v11", "engine-v3-rc", "release-4"];
  assert.deepEqual(releaseNumbers(tags), [2, 9, 10]);
  assert.equal(nextRelease(tags), 11);
});

test("rollback picks the newest Cloudflare version carrying the release tag", () => {
  const versions = [
    { annotations: { "workers/tag": "v4" }, id: "old-v4", metadata: { created_on: "2026-10-01T10:00:00Z" } },
    { annotations: { "workers/tag": "v4" }, id: "rebuilt-v4", metadata: { created_on: "2026-10-03T10:00:00Z" } },
    { annotations: { "workers/tag": "v5" }, id: "v5", metadata: { created_on: "2026-10-02T10:00:00Z" } },
    { id: "untagged", metadata: { created_on: "2026-10-04T10:00:00Z" } },
  ];
  assert.equal(versionIdFor(versions, "v4"), "rebuilt-v4");
  assert.equal(versionIdFor(versions, "v1"), null);
});
