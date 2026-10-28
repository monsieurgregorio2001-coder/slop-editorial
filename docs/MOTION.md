# Slop Editorial motion

Every animation in this room (DIRECTION 3.5). An animation without a line here is cut. The house layer's own animations are in the hub's `house/MOTION.md`. `--ease` is `cubic-bezier(.2, .7, .1, 1)` in `site/src/styles/tokens.css`.

**Calm** is the room's `data-rm` attribute on the root. It is set before first paint from the stored choice or `prefers-reduced-motion`, and follows the house Calm switch (`data-motion="calm"`). With it on, view transitions are off, CSS animations run for 0.01 ms, and the timed counters and staged waits resolve at once, so every page is complete and still. Nothing in the room loops.

| Animation | Purpose | Token and time | Calm |
| --- | --- | --- | --- |
| Page transition, wipe or hold | Moves between pages inside one document. The certificate page wipes in, the feed and home hold. | clip-path keyframes (`clip-in-*`, `clip-out-*`, `drift-out-*`), view-transition animation | Off. The new page appears at once. |
| Hero still morph | The home cover and the feed still are one named element, so the picture travels between them. | `view-transition-group(hero-still)`, 700 ms, `--ease` | Not named, no animation. |
| Mode colour change | Colour tokens ease when the page switches between product and slop mode. | `--mode-ease`, 500 ms | No transition. |
| Tile image scale | A tile image grows slightly on hover. | `scale`, 600 ms, `--ease` | Held still. |
| Cookie sheet | The joke sheet slides up from the bottom edge. | `translate`, 600 ms, `--ease` | Appears at once. |
| Dialog in | The joke dialog fades in and settles from scale .96. | `dialog-in` keyframes | Appears at once. |
| Install bar | The fake install bar fills. Theatre, no real work. | `width`, 1400 ms, `--ease` | Fills at once. |
| Hold ring | Touch only. A ring fills over 900 ms while a finger is held on the feed, then the action fires. | `--p` per frame, 900 ms | The press still works. The ring is not drawn mid-fill. |
| Feed still lean | The feed still leans toward the pointer, a spring that settles. | motion spring, stiffness 70, damping 18 | Not started. The still stays centred. |
| Feed inserts | An inserted line reveals left to right. | `ins` clip-path keyframes, 500 ms, `--ease` | Shown at once. |
| Metric counters | A number counts up once when it scrolls into view. | gsap, 1.2 s | Shows the final value. |
| Visitor notice | The staged notice fades in under the visitor line. The row height never changes. | `opacity`, 400 ms, `--ease` | Appears at once. |
| Certificate beats | The authenticity story reveals one beat at a time as you scroll. | `opacity` and `transform`, 600 ms, `--ease` | All beats shown, no movement. |
| Certificate shop items | The shop items fade and rise 10 px when their step is reached. | `opacity`, `translate`, 500 ms, `--ease` | Shown at once. |
| Certificate back title | The closing title changes colour on hover. | `color`, 300 ms, `--ease` | Colour change only. |
