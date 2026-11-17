import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { carryPrevious, listFiles, replaceArchive } from "./keep-static.mjs";

function tree(root, files) {
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), body);
  }
}

function scratch(t) {
  // Disk-backed scratch next to the test, not the RAM-backed /tmp.
  const root = mkdtempSync(path.join(import.meta.dirname, ".keep-static-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("previous chunks are added, the new build's files are never overwritten", (t) => {
  const root = scratch(t);
  const archive = path.join(root, "archive"), live = path.join(root, "static");
  tree(archive, { "chunks/old-aaa.js": "old", "chunks/shared-bbb.js": "previous copy", "css/old.css": "c" });
  tree(live, { "chunks/new-ccc.js": "new", "chunks/shared-bbb.js": "new copy" });
  assert.deepEqual(carryPrevious(archive, live), { added: 2, skipped: null, probe: "chunks/old-aaa.js" });
  assert.deepEqual(listFiles(live), ["chunks/new-ccc.js", "chunks/old-aaa.js", "chunks/shared-bbb.js", "css/old.css"]);
  assert.equal(readFileSync(path.join(live, "chunks/shared-bbb.js"), "utf8"), "new copy");
});

test("first release (no archive) and the file limit carry nothing", (t) => {
  const root = scratch(t);
  const live = path.join(root, "static");
  tree(live, { "a.js": "a" });
  assert.deepEqual(carryPrevious(path.join(root, "missing"), live), { added: 0, skipped: "no-archive", probe: null });
  const archive = path.join(root, "archive");
  tree(archive, { "b.js": "b", "c.js": "c" });
  assert.deepEqual(carryPrevious(archive, live, { assetFiles: 9, maxFiles: 10 }), { added: 0, skipped: "file-limit", probe: null });
  assert.deepEqual(listFiles(live), ["a.js"]);
});

test("the archive keeps one release: only the build's own files, so carried chunks do not pile up", (t) => {
  const root = scratch(t);
  const archive = path.join(root, "archive");
  tree(archive, { "r1.js": "1" });
  // Release 2: carries r1 into its upload, but archives only its own files.
  const own2 = path.join(root, "own2"), live2 = path.join(root, "live2");
  tree(own2, { "r2.js": "2" });
  tree(live2, { "r2.js": "2" });
  carryPrevious(archive, live2);
  assert.deepEqual(listFiles(live2), ["r1.js", "r2.js"]);
  replaceArchive(own2, archive);
  assert.deepEqual(listFiles(archive), ["r2.js"]);
  // Release 3 serves r2 (the version just replaced) but no longer r1.
  const live3 = path.join(root, "live3");
  tree(live3, { "r3.js": "3" });
  carryPrevious(archive, live3);
  assert.deepEqual(listFiles(live3), ["r2.js", "r3.js"]);
});
