import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertOutsidePublic } from "../scripts/lib-fence.mjs";

test("the fence refuses public/ and anything inside it", () => {
  for (const bad of ["public", "public/img", "./public/img/seal", "../site/public/img"]) assert.throws(() => assertOutsidePublic(bad, "/work/site"), /generated photographs/, bad);
});

test("the fence allows folders outside public/", () => {
  assert.equal(assertOutsidePublic("art-src/render", "/work/site"), "/work/site/art-src/render");
  assert.equal(assertOutsidePublic("public-notes", "/work/site"), "/work/site/public-notes");
});

test("make-art.mjs writes through the fence, not to public/img", async () => {
  const src = await readFile(new URL("../scripts/make-art.mjs", import.meta.url), "utf8");
  assert.match(src, /assertOutsidePublic\("art-src\/render"\)/);
  assert.doesNotMatch(src, /resolve\("public\/img"\)/);
});
