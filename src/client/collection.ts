import type { Card } from "../contracts/catalog.ts";
import type { InventoryPage } from "../contracts/inventory.ts";

export const MARKETPLACE = "https://collectorcrypt.com/marketplace/cards";
export function collectibleUrl(mint: string | null | undefined): string {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint ?? "")
    ? `https://collectorcrypt.com/assets/solana/${mint}`
    : MARKETPLACE;
}
export function definitionFor(
  item: InventoryPage["items"][number],
  catalog: Card[],
): Card | null {
  const known = catalog.find((c) => c.collectible.mint === item.mint);
  if (known) return known;
  const text = `${item.name} ${item.description}`;
  if (!/fusion world/i.test(text)) return null;
  const match = text.match(/\b(FB|SB|FS|FP)(\d{2})-?(\d{2,3})\b/i);
  return match
    ? (catalog.find(
        (c) => c.id === `${match[1].toUpperCase()}${match[2]}-${match[3]}`,
      ) ?? null)
    : null;
}
export function mergeInventory<T extends { mint: string }>(
  previous: T[],
  incoming: T[],
): T[] {
  const seen = new Set(previous.map((i) => i.mint));
  return [
    ...previous,
    ...incoming.filter((i) => {
      if (seen.has(i.mint)) return false;
      seen.add(i.mint);
      return true;
    }),
  ];
}
