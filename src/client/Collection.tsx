import type { Card } from "../shared/types.ts";
import {
  collectibleUrl,
  definitionFor,
  type InventoryItem,
} from "./collection.ts";

export interface InventoryState {
  items: InventoryItem[];
  code: InventoryCode;
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string;
  fetchedAt: string | null;
}
export type InventoryCode =
  "dragonball_50" | "dragonball_100" | "dragonball_250";
export const inventoryCodes: InventoryCode[] = [
  "dragonball_50",
  "dragonball_100",
  "dragonball_250",
];
export const emptyInventory = (
  code: InventoryCode = "dragonball_50",
): InventoryState => ({
  items: [],
  code,
  cursor: null,
  hasMore: true,
  loading: false,
  error: "",
  fetchedAt: null,
});

export function inventoryApiPath(
  code: InventoryCode,
  cursor: string | null,
): string {
  if (!inventoryCodes.includes(code))
    throw new Error("Unknown inventory pool.");
  const query = new URLSearchParams({ code });
  if (cursor) query.set("cursor", cursor);
  return `/api/inventory?${query.toString()}`;
}
export function inventoryRows(items: InventoryItem[], catalog: Card[]) {
  return items.map((item) => ({ item, card: definitionFor(item, catalog) }));
}

export function Collection({
  inventory,
  cards,
  onPoolChange,
  onLoad,
  onDetail,
}: {
  inventory: InventoryState;
  cards: Card[];
  onPoolChange(code: InventoryCode): void;
  onLoad(): void;
  onDetail(card: Card): void;
}) {
  const rows = inventoryRows(inventory.items, cards);
  return (
    <section className="collection-section" id="collection">
      <div className="section-heading">
        <div>
          <p className="eyebrow">COLLECTOR CRYPT / LIVE COLLECTION</p>
          <h2>Discover more cards.</h2>
        </div>
      </div>
      <p className="muted">
        Explore the real Dragon Ball inventory. Arena-ready cards have verified
        stats; other collectibles stay browse-only.
      </p>
      <div className="collection-controls">
        <label htmlFor="inventory-machine">Inventory pool</label>
        <select
          id="inventory-machine"
          value={inventory.code}
          disabled={inventory.loading}
          onChange={(event) =>
            onPoolChange(event.currentTarget.value as InventoryCode)
          }
        >
          {inventoryCodes.map((code) => (
            <option key={code} value={code}>
              {code.replace("dragonball_", "Dragon Ball ")}
            </option>
          ))}
        </select>
        <span>
          {inventory.items.length} collectibles loaded
          {inventory.fetchedAt
            ? ` · Checked ${new Date(inventory.fetchedAt).toLocaleTimeString()}`
            : ""}
        </span>
      </div>
      <div className="inventory-grid">
        {rows.map(({ item, card }) => (
          <article className="inventory-card" key={item.mint}>
            {item.image ? (
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="missing-art">Image unavailable</div>
            )}
            <span className="inventory-status">
              {card
                ? `ARENA READY · ${card.id}`
                : "COLLECTIBLE · NOT PLAYABLE YET"}
            </span>
            <h3>{item.name}</h3>
            <p>
              {card
                ? "Verified battle stats. Select this definition in the roster above."
                : "Needs a verified Battle-card definition before arena play."}
            </p>
            <a
              href={collectibleUrl(item.mint)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View / buy on Collector Crypt ↗
            </a>
            {card && (
              <button className="text-button" onClick={() => onDetail(card)}>
                Arena details ↗
              </button>
            )}
          </article>
        ))}
      </div>
      <p className="inventory-message" role="status">
        {inventory.error ||
          (!inventory.hasMore
            ? "You have reached the end of this inventory pool."
            : inventory.items.length
              ? "Inventory is a live sample, not a guarantee that a card is listed for sale."
              : "")}
      </p>
      <button
        className="button secondary load-inventory"
        onClick={onLoad}
        disabled={inventory.loading || !inventory.hasMore}
      >
        {inventory.loading
          ? "Loading Collector Crypt…"
          : inventory.error
            ? "Retry loading cards"
            : inventory.items.length
              ? "Load more cards"
              : "Load Collector Crypt cards"}{" "}
        ↗
      </button>
    </section>
  );
}
