// Markup for the spend cap result. Used at build time for the default state and in the browser after every change,
// so the two can never disagree. The CLI's strings sit in <code data-verbatim>: quoted output, not site copy.
import { money, type Result } from "./spend.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const perImage = (usd: number) => (usd === 0 ? "0.00" : String(usd));

export function resultHtml(r: Result): string {
  if (r.kind === "error") {
    return `<p class="cap__tag is-error">Check this input</p><p class="cap__msg">${esc(r.text)}</p>`;
  }
  const { row, jobs, total, cap, verdict } = r;
  const capText = Number.isFinite(cap) && cap >= 0 ? `USD ${money(cap)}` : "not valid";
  const sum = row.free
    ? `<p class="cap__sum">${jobs} jobs on the free ${esc(row.provider)} provider. Estimated spend <strong>USD 0.00</strong>. The mock provider has no cap and needs no approval.</p>`
    : `<p class="cap__sum">${jobs} jobs at USD ${perImage(row.usd)} each. Estimated spend <strong>USD ${money(total)}</strong>. Cap ${capText}.</p>`;
  if (verdict.refused) {
    return `${sum}<div class="cap__verdict is-refused"><p class="cap__tag">Refused</p><p class="cap__msg">The CLI prints this and starts nothing.</p><p><code data-verbatim class="cli">slopgen: ${esc(verdict.message)}</code></p></div>`;
  }
  if (!row.free) {
    return `${sum}<div class="cap__verdict is-under"><p class="cap__tag">Under the cap</p><p class="cap__msg">The CLI still stops until a person approves. Without the flags it prints these two lines in turn.</p><ol class="cap__req">${verdict.requirements.map((m) => `<li><code data-verbatim class="cli">slopgen: ${esc(m)}</code></li>`).join("")}</ol><p class="cap__cmd">With both flags set the command is <code data-verbatim class="cli">${esc(r.command)}</code></p></div>`;
  }
  return `${sum}<div class="cap__verdict is-under"><p class="cap__tag">Free to run</p><p class="cap__msg">Nothing is billed, so the gate does not ask for a flag.</p><p><code data-verbatim class="cli">${esc(r.command)}</code></p></div>`;
}
