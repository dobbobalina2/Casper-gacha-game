import type { Card } from "../shared/types.ts";
export const MARKETPLACE = "https://collectorcrypt.com/marketplace/cards";
export function collectibleUrl(mint: string | null | undefined): string {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint ?? "")
    ? `https://collectorcrypt.com/assets/solana/${mint}`
    : MARKETPLACE;
}
export interface InventoryItem {
  mint: string;
  name: string;
  description: string;
  image: string;
  inventorySource?: string;
  observedAt?: string;
}
export function definitionFor(
  item: InventoryItem,
  catalog: Card[],
): Card | null {
  const known = catalog.find((card) => card.collectible.mint === item.mint);
  if (known) return known;
  const text = `${item.name} ${item.description}`;
  if (!/fusion world/i.test(text)) return null;
  const match = text.match(/\b(FB|SB|FS|FP)(\d{2})-?(\d{2,3})\b/i);
  return match
    ? (catalog.find(
        (card) =>
          card.id === `${match[1].toUpperCase()}${match[2]}-${match[3]}`,
      ) ?? null)
    : null;
}
export function mergeInventory<T extends { mint: string }>(
  previous: T[],
  incoming: T[],
): T[] {
  const seen = new Set(previous.map((item) => item.mint));
  return [
    ...previous,
    ...incoming.filter((item) => {
      if (seen.has(item.mint)) return false;
      seen.add(item.mint);
      return true;
    }),
  ];
}
