# Slop Editorial: Local context

Updated: 2026-10-20 (Asia/Manila). Facts come from local README/layout inspection; historical app metrics were not rerun.

## Implementation

Astro site in site/ and Python image generation pipeline in pipeline/. Nine existing PNGs are in incoming/. They were untracked before this documentation work.

See [README](../README.md) for setup and detailed architecture.

## Current context

The shared inventory records filenames, sizes, and SHA-256. Visual QA, V3 slot matching, and approval remain unknown. Recover the full V3 brief before generating or integrating candidates. Preserve originals.

[Shared current state](../../monsieurgregorio2001-coder.github.io/docs/portfolio/CURRENT-STATE.md) holds cross-project priorities. [Workflow](../../monsieurgregorio2001-coder.github.io/docs/portfolio/WORKFLOW.md) keeps documentation proportional. Formatting defaults are in .editorconfig. This checkpoint's documentation/config changes are local and uncommitted.

## Verification entry points

For site changes use `npm test`, `npm run build`, and `npm run check` from site/. Use `npm run verify` for affected interactions. Pipeline checks are documented in the root README. Documentation-only cleanup did not rerun app suites.

## Standalone checkout

Local facts are usable without sibling repositories. Shared context lives in the [portfolio hub repository](https://github.com/monsieurgregorio2001-coder/monsieurgregorio2001-coder.github.io), under docs/portfolio/. New files may not be committed there yet. Record unavailable context instead of inventing decisions. Update this file only when project facts change.
