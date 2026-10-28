// The nine photographs in public/img came from an image model and are final. Anything that renders images
// must write outside public/, so a re-run can never overwrite them.
import path from "node:path";

/** Throws when `dir` is public/ or inside it. Returns the resolved directory. */
export function assertOutsidePublic(dir, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, dir);
  const pub = path.resolve(cwd, "public");
  const rel = path.relative(pub, resolved);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    throw new Error(`refusing to write images to ${path.relative(cwd, resolved) || "public"}: public/img holds the generated photographs`);
  }
  return resolved;
}
