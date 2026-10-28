// The spend gate, ported from pipeline/slopgen/spend.py. The messages are the CLI's own strings.
// Parity: pipeline/slopgen/spend_fixtures.py writes test/fixtures/spend-parity.json, and
// test/spend-parity.test.mjs replays every row through this file. Python and TypeScript must agree on all of them.
// Runs in the browser. Generates nothing, calls no provider, sends nothing.

export type PriceRow = { provider: string; model: string; mode: string; usd: number; free: boolean };
export type Verdict = { refused: boolean; message: string; requirements: string[] };

export const MSG_CAP_INVALID = "--max-usd must be a finite, non-negative amount";
export const MSG_NO_APPROVAL = "paid runs need --approval-ref naming the recorded human approval";

/** Python's f"{x:.2f}" rounds an exact tie to even. JavaScript's toFixed rounds it up. Only exact ties differ. */
function toFixedEven(x: number, digits: number): string {
  const scale = 10 ** digits;
  const y = x * scale;
  // A tie needs x to be an exact multiple of 1 / 2^(digits+1). Scaling by a power of two is exact, so this test is exact.
  if (x >= 0 && Number.isFinite(y) && Number.isInteger(x * 2 ** (digits + 1)) && !Number.isInteger(y) && Math.abs(y - Math.trunc(y) - 0.5) === 0) {
    const n = Math.trunc(y);
    return ((n % 2 === 0 ? n : n + 1) / scale).toFixed(digits);
  }
  return x.toFixed(digits);
}

/** Python's round(x, 4) for non-negative numbers: exact ties go to even. */
export function round4(x: number): number {
  return Number(toFixedEven(x, 4));
}

export const money = (x: number): string => toFixedEven(x, 2);

export function msgNeedYes(total: number, provider: string): string {
  return `estimated spend $${money(total)} on ${provider}; rerun with --yes to proceed`;
}

export function msgOverCap(total: number, cap: number): string {
  return `estimated $${money(total)} exceeds --max-usd ${money(cap)}; raise the cap or narrow with --only`;
}

/** The runner's estimate: a plain sum of per-job estimates, rounded to four places. */
export function plannedTotal(perImage: number, jobs: number): number {
  let sum = 0;
  for (let i = 0; i < jobs; i++) sum += perImage;
  return round4(sum);
}

/** The message `slopgen run` would raise for these flags, or null when the run may start. */
export function refusal(total: number, cap: number, provider: string, free: boolean, yes: boolean, approvalRef: string | null): string | null {
  if (!Number.isFinite(cap) || cap < 0) return MSG_CAP_INVALID;
  if (free) return null;
  if (!yes) return msgNeedYes(total, provider);
  if (!approvalRef) return MSG_NO_APPROVAL;
  if (total > cap) return msgOverCap(total, cap);
  return null;
}

/** What the toy shows: a run with --yes and an approval reference. Over the cap, the CLI's refusal. Under it, what the CLI still demands. */
export function evaluate(total: number, cap: number, provider: string, free: boolean): Verdict {
  const over = refusal(total, cap, provider, free, true, "APPROVAL-REF");
  if (over) return { refused: true, message: over, requirements: [] };
  if (free) return { refused: false, message: "", requirements: [] };
  return {
    refused: false,
    message: "",
    requirements: [refusal(total, cap, provider, free, false, null) as string, refusal(total, cap, provider, free, true, null) as string],
  };
}

export const MAX_PLATES = 40;
export const MAX_REROLLS = 5;

export type Inputs = { plates: string; rerolls: string; model: string; cap: string };
export type Result =
  | { kind: "error"; field: "plates" | "rerolls" | "cap" | "model"; text: string }
  | { kind: "ok"; row: PriceRow; jobs: number; total: number; cap: number; verdict: Verdict; command: string };

const whole = (s: string, lo: number, hi: number): number | null => (/^\d+$/.test(s.trim()) && Number(s) >= lo && Number(s) <= hi ? Number(s) : null);

/** Turns what a reader typed into the toy's result. Bad plates or rerolls are asked for again. A bad cap gets the CLI's own words. */
export function compute(input: Inputs, table: PriceRow[]): Result {
  const plates = whole(input.plates, 1, MAX_PLATES);
  if (plates === null) return { kind: "error", field: "plates", text: `Enter a whole number of plates from 1 to ${MAX_PLATES}.` };
  const rerolls = whole(input.rerolls, 0, MAX_REROLLS);
  if (rerolls === null) return { kind: "error", field: "rerolls", text: `Enter a whole number of rerolls from 0 to ${MAX_REROLLS}.` };
  const row = table.find((r) => `${r.provider}|${r.model}` === input.model);
  if (!row) return { kind: "error", field: "model", text: "Choose a model from the list." };
  const raw = input.cap.trim();
  if (raw === "") return { kind: "error", field: "cap", text: "Enter a cap in US dollars. Zero is allowed." };
  const cap = Number(raw);
  if (Number.isNaN(cap)) return { kind: "error", field: "cap", text: MSG_CAP_INVALID };
  const jobs = plates * (1 + rerolls);
  const total = plannedTotal(row.usd, jobs);
  const verdict = evaluate(total, cap, row.provider, row.free);
  const command = row.free
    ? `python -m slopgen run --provider ${row.provider}`
    : `python -m slopgen run --provider ${row.provider} --yes --approval-ref APPROVAL-0042 --max-usd ${Number.isFinite(cap) && cap >= 0 ? money(cap) : "?"}`;
  return { kind: "ok", row, jobs, total, cap, verdict, command };
}
