// Optional, off by default, never autoplays. Synthesised with Web Audio so no audio asset
// or provider is involved. The footer toggle is the explicit opt-in.
let ctx: AudioContext | null = null;
let enabled = false;

function ac(): AudioContext | null {
  try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; }
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slide?: number) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

export type Cue = "shutter" | "confirm" | "seal" | "chime" | "card";
export function play(cue: Cue) {
  if (!enabled) return;
  switch (cue) {
    case "shutter": tone(1800, 0.03, "square", 0.05); tone(240, 0.09, "triangle", 0.06, 0.045, 90); break;
    case "confirm": tone(1320, 0.12, "sine", 0.05); tone(990, 0.2, "sine", 0.04, 0.09); break;
    case "seal": tone(58, 2.4, "sine", 0.1); tone(87, 2.8, "sine", 0.05, 0.1); break;
    case "chime": tone(1568, 0.5, "sine", 0.035); tone(2093, 0.7, "sine", 0.025, 0.12); break;
    case "card": tone(420, 0.04, "square", 0.03); tone(260, 0.05, "square", 0.03, 0.05); break;
  }
}

function sync() {
  document.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", String(enabled));
    b.textContent = enabled ? "Sound: on" : "Sound: off";
    if (!b.dataset.bound) {
      b.dataset.bound = "1";
      b.addEventListener("click", () => {
        enabled = !enabled;
        if (enabled) { ac()?.resume(); play("confirm"); }
        sync();
      });
    }
  });
}
document.addEventListener("astro:page-load", sync);
if (document.readyState !== "loading") sync();
