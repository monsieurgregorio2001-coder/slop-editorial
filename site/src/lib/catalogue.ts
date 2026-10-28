// The exhibition, in hanging order. The Still and the Certificate are the two rooms with their own
// pages. The seven works between them come from the content collection. Numbers are plates.
import { getCollection } from "astro:content";
import { VIEW_BASE, formatCount, usd, priceLabel } from "./text.js";

export type Piece = {
  n: string;
  title: string;
  href: string;
  image: string;
  alt: string;
  meta: string;
  viewed?: keyof typeof VIEW_BASE;
};

export async function catalogue(): Promise<Piece[]> {
  const works = (await getCollection("works")).sort((a, b) => a.data.order - b.data.order);
  const still: Piece = {
    n: "01", title: "The Still", href: "feed/", image: "hero-still",
    alt: "A neon sunset over violet peaks and a mirrored lake. A floodlit wooden sign in the foreground reads Sunseet Point, Open 24 hours of hours.",
    meta: `★ 4.2 · ${formatCount(VIEW_BASE["the-still"])} views · Free`, viewed: "the-still",
  };
  const cert: Piece = {
    n: String(works.length + 2).padStart(2, "0"), title: "Certificate of Human Touch", href: "authenticity/", image: "seal-poster",
    alt: "A gold-framed certificate on a red velvet plinth. It reads Certificate of Human Touch, 100% human made. A plaque below reads Generated in 0.8 seconds.",
    meta: `★ 4.2 · ${formatCount(VIEW_BASE["the-certificate"])} views · ${usd(14.99)}`, viewed: "the-certificate",
  };
  const middle: Piece[] = works.map((w, i) => ({
    n: String(i + 2).padStart(2, "0"),
    title: w.data.title,
    href: `works/${w.id}/`,
    image: w.data.image,
    alt: w.data.alt,
    meta: `★ ${w.data.rating} · ${w.data.views} views · ${priceLabel(w.data.price)}`,
  }));
  return [still, ...middle, cert];
}

/** The plate number for a work, by its order in the collection. */
export const plateFor = (order: number) => String(order + 1).padStart(2, "0");
