import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Sample works: original satire about AI content and the attention economy.
const works = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/works" }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    topic: z.string(),
    kicker: z.string(),
    alt: z.string(),
    image: z.string(),
    rank: z.number(),
    rating: z.string(),
    ratings: z.number(),
    views: z.string(),
    availability: z.string(),
    price: z.string(),
    also: z.string(),
  }),
});

// Releases: each sample issue waits behind a human approval gate.
const releases = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/releases" }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    order: z.number(),
    work: z.string(),
    kind: z.string(),
    window: z.string(),
    state: z.enum(["DRAFT", "IN_REVIEW", "READY", "APPROVED"]),
    production: z.string(),
    estimate: z.string(),
    cap: z.string(),
    approval: z.string(),
    destination: z.string(),
    brief: z.string(),
    caption: z.string(),
    open: z.array(z.string()).default([]),
    price: z.string().default("0.00"),
  }),
});

export const collections = { works, releases };
