import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Every piece on this site is a labelled sample written for the demo.
// `sample` must be true: the build gate fails if a page lacks the sample notice.
const pieces = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/pieces" }),
  schema: z.object({
    title: z.string(),
    kicker: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    order: z.number(),
    sample: z.literal(true),
  }),
});

export const collections = { pieces };
