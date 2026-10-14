import type { TransitionAnimationPair } from "astro";

const easing = "cubic-bezier(.7, 0, .2, 1)";
const none = { name: "none", duration: "0.01ms" } as const;

/** Arriving here wipes the new page over the old one. The persistent shell stays put. */
export const wipeIn: TransitionAnimationPair = {
  forwards: {
    old: { name: "drift-out-left", duration: "800ms", easing, fillMode: "forwards" },
    new: { name: "clip-in-right", duration: "800ms", easing, fillMode: "backwards" },
  },
  backwards: {
    old: { name: "drift-out-right", duration: "800ms", easing, fillMode: "forwards" },
    new: { name: "clip-in-left", duration: "800ms", easing, fillMode: "backwards" },
  },
};

/** The shared still carries the transition. The page itself holds still. */
export const hold: TransitionAnimationPair = {
  forwards: { old: none, new: none },
  backwards: { old: none, new: none },
};
