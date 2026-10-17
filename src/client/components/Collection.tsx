import { useState } from "react";
import type { Card } from "../../shared/contracts/catalog.ts";
import type { InventoryPage } from "../../shared/contracts/inventory.ts";
import { collectibleUrl, definitionFor, MARKETPLACE } from "../collection.ts";
export interface InventoryState {
  items: InventoryPage["items"];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string;
  fetchedAt: string | null;
  code: string;
}
export const emptyInventory = (code = "dragonball_50"): InventoryState => ({
  items: [],
  cursor: null,
  hasMore: true,
  loading: false,
  error: "",
  fetchedAt: null,
  code,
});
function InventoryCard({
  item,
  cards,
  onDetail,
}: {
  item: InventoryPage["items"][number];
  cards: Card[];
  onDetail(c: Card): void;
}) {
  const card = definitionFor(item, cards);
  const [failed, setFailed] = useState(false);
  return (
    <article className="inventory-card">
      {item.image && !failed ? (
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="missing-art">Image unavailable</div>
      )}
      <div>
        <span className="inventory-status">
          {card ? `ARENA READY · ${card.id}` : "COLLECTIBLE · NOT PLAYABLE YET"}
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
      </div>
    </article>
  );
}
export function Collection({
  inventory,
  cards,
  onDetail,
  onLoad,
  onPool,
}: {
  inventory: InventoryState;
  cards: Card[];
  onDetail(c: Card): void;
  onLoad(): void;
  onPool(code: string): void;
}) {
  return (
    <section className="collection-section" id="collection">
      <div className="section-heading">
        <div>
          <p className="eyebrow">COLLECTOR CRYPT / LIVE COLLECTION</p>
          <h2>Discover more cards.</h2>
        </div>
        <a
          className="source"
          href={MARKETPLACE}
          target="_blank"
          rel="noopener noreferrer"
        >
          Browse marketplace ↗
        </a>
      </div>
      <p className="muted">
        Explore the real Dragon Ball inventory. Arena-ready cards have verified
        stats; other collectibles stay browse-only. Open an individual card to
        check purchase or offer options.
      </p>
      <div className="collection-controls">
        <label>
          Inventory pool
          <select
            id="inventory-machine"
            value={inventory.code}
            disabled={inventory.loading}
            onChange={(e) => onPool(e.target.value)}
          >
            {[50, 100, 250].map((n) => (
              <option key={n} value={`dragonball_${n}`}>
                Dragon Ball {n}
              </option>
            ))}
          </select>
        </label>
        <span>
          {inventory.items.length} collectibles loaded
          {inventory.fetchedAt
            ? ` · Checked ${new Date(inventory.fetchedAt).toLocaleTimeString()}`
            : ""}
        </span>
      </div>
      <div className="inventory-grid">
        {inventory.items.map((item) => (
          <InventoryCard
            key={item.mint}
            item={item}
            cards={cards}
            onDetail={onDetail}
          />
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
        disabled={inventory.loading || !inventory.hasMore}
        onClick={onLoad}
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
