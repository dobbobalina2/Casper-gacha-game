import type { Card, Special } from "./contracts/catalog.ts";

// Special definitions arrive with each validated database card.
export const specialFor = (card: Card | null | undefined): Special | null =>
  card?.special ?? null;
export const specialCost = (card: Card): number =>
  Math.max(1, Math.ceil(card.cost / 3)) + (specialFor(card)?.extraEnergy ?? 0);
