// The room's receipt, rendered from its own evidence.json (DIRECTION 4.4). No figure is typed here:
// every number comes from the file the CI run wrote. A missing file or field reads "not measured yet".

type Test = { id: string; label: string; passed: number; total: number; command: string };
type Budget = { id: string; limit: number; actual: number };
export type Evidence = { schema?: number; commit?: string; ran_at?: string; runner?: string; tests?: Test[]; evals?: Test[]; budgets?: Budget[]; limits?: string[] };

const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const MISSING = '<span class="house-fig is-missing">not measured yet</span>';
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

const label = (id: string) => ({ "js-home-gz": "JavaScript, home page", "js-certificate-gz": "JavaScript, certificate page", "image-max": "Largest image" })[id] ?? id;

export function testsHtml(e: Evidence | null): string {
  if (!e?.tests?.length) return MISSING;
  return `<ul class="rcp__list">${e.tests.map((t) => `<li><span class="num">${esc(t.passed)} of ${esc(t.total)}</span> ${esc(t.label)}<br><code data-verbatim class="cli">${esc(t.command)}</code></li>`).join("")}</ul>`;
}

export function evalsHtml(e: Evidence | null): string {
  if (!e || !Array.isArray(e.evals)) return MISSING;
  if (!e.evals.length) return "None. Nothing here scores output quality.";
  return `<ul class="rcp__list">${e.evals.map((t) => `<li><span class="num">${esc(t.passed)} of ${esc(t.total)}</span> ${esc(t.label)}</li>`).join("")}</ul>`;
}

export function budgetsHtml(e: Evidence | null): string {
  if (!e?.budgets?.length) return MISSING;
  return `<ul class="rcp__list">${e.budgets.map((b) => `<li>${esc(label(b.id))}: <span class="num">${kb(b.actual)}</span> of ${kb(b.limit)}</li>`).join("")}</ul>`;
}

export function limitsHtml(e: Evidence | null): string {
  if (!e?.limits?.length) return MISSING;
  return `<ul class="rcp__list">${e.limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

export function runHtml(e: Evidence | null): string {
  if (!e?.commit || !e.ran_at) return MISSING;
  return `Commit <code data-verbatim class="cli">${esc(e.commit)}</code>, run on ${esc(e.ran_at.slice(0, 10))}. ${esc(e.runner ?? "")}`;
}

export const SLOTS = { tests: testsHtml, evals: evalsHtml, budgets: budgetsHtml, limits: limitsHtml, run: runHtml } as const;
