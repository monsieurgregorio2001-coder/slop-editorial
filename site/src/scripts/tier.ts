export type Tier = "webgpu" | "webgl" | "poster";

/** Pick the 3D tier. Progressive enhancement: nobody gets a broken page. */
export function pickTier(): { tier: Tier; why: string } {
  const q = new URLSearchParams(location.search).get("tier");
  if (q === "poster" || q === "webgl" || q === "webgpu") return { tier: q, why: "forced by ?tier" };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean }; gpu?: unknown };
  if (nav.connection?.saveData) return { tier: "poster", why: "data saver" };
  if (matchMedia("(pointer: coarse)").matches) return { tier: "poster", why: "touch device" };
  if ((nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return { tier: "poster", why: "low-power device" };
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return { tier: "poster", why: "no WebGL" };
  } catch { return { tier: "poster", why: "no WebGL" }; }
  if (nav.gpu) return { tier: "webgpu", why: "WebGPU available" };
  return { tier: "webgl", why: "WebGL only" };
}
