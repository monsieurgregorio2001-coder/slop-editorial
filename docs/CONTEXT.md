# Slop Editorial: Local context

Updated: 2026-10-28. The room is joined to house 2.0.0 (`site/house.lock.json`, `HOUSE_DIR` points at a hub checkout). The certificate page uses the generated photograph, not three.js. The Method page carries the spend cap toy, backed by `pipeline/slopgen/spend.py`, parity fixtures and a committed mock run record. Counts are in the README.

## Implementation

Astro site in site/ and Python image generation pipeline in pipeline/. Nine PNG masters are in incoming/ and stay in git (owner decision, 2026-10-28). `npm run art` must not be run and cannot write to public/img.

See [README](../README.md) for setup and detailed architecture.

## Current context

The shared inventory records filenames, sizes, and SHA-256. Visual QA, V3 slot matching, and approval remain unknown. Recover the full V3 brief before generating or integrating candidates. Preserve originals.

[Shared current state](../../monsieurgregorio2001-coder.github.io/docs/portfolio/CURRENT-STATE.md) holds cross-project priorities. [Workflow](../../monsieurgregorio2001-coder.github.io/docs/portfolio/WORKFLOW.md) keeps documentation proportional. Formatting defaults are in .editorconfig. This checkpoint's documentation/config changes are local and uncommitted.

## Verification entry points

For site changes use `npm test`, `npm run build`, and `npm run check` from site/. Use `npm run verify` for affected interactions. Pipeline checks are documented in the root README. Documentation-only cleanup did not rerun app suites.

## Standalone checkout

Local facts are usable without sibling repositories. Shared context lives in the [portfolio hub repository](https://github.com/monsieurgregorio2001-coder/monsieurgregorio2001-coder.github.io), under docs/portfolio/. New files may not be committed there yet. Record unavailable context instead of inventing decisions. Update this file only when project facts change.
