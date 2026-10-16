import { useEffect, useRef, type ReactNode } from "react";
import type { Card } from "../../contracts/catalog.ts";
import { attackCost, baseDamage } from "../../shared/engine.ts";
import { specialCost } from "../../shared/specials.ts";
import { collectibleUrl } from "../collection.ts";

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog id="dialog" ref={ref} onCancel={onClose}>
      <div id="dialog-content">{children}</div>
      <button className="button secondary close-dialog" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
export function CardDetails({ card: c }: { card: Card }) {
  return (
    <>
      <p className="eyebrow">VERIFIED CARD DEFINITION</p>
      <h2>{c.name}</h2>
      <p className="muted">
        {c.id} · {c.family} · {c.color} · Battle
      </p>
      <div className="detail-layout">
        <img src={c.image} alt={c.collectible.description} />
        <div>
          <dl>
            <dt>Printed power</dt>
            <dd>{c.power.toLocaleString()}</dd>
            <dt>Printed combo power</dt>
            <dd>
              {c.comboPower === null
                ? "— (no combo)"
                : c.comboPower.toLocaleString()}
            </dd>
            <dt>Printed cost</dt>
            <dd>{c.cost}</dd>
            <dt>Arena attack energy</dt>
            <dd>{attackCost(c)}</dd>
            <dt>Arena base damage</dt>
            <dd>{baseDamage(c)}</dd>
          </dl>
          <a
            className="source"
            href={c.statsSource}
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Bandai stats ↗
          </a>
        </div>
      </div>
      <div className="special-detail">
        <p className="eyebrow">CASPER SPECIAL / ONCE PER MATCH</p>
        <h3>{c.special.name}</h3>
        <p>
          {c.special.description} Costs {specialCost(c)} energy.
        </p>
        <p className="muted">
          Custom arena ability, not the printed card skill.
        </p>
      </div>
      <h3>Collectible reference</h3>
      <p>{c.collectible.description}</p>
      <p className="muted">
        Snapshot: {c.collectible.observedAt}. Matched by card number and game
        family. Exact alternate-art printing unverified. Availability and
        ownership are not live.
      </p>
      <a
        className="button secondary shop-card"
        href={collectibleUrl(c.collectible.mint)}
        target="_blank"
        rel="noopener noreferrer"
      >
        View / buy on Collector Crypt ↗
      </a>
      <p className="muted">
        Opens this exact collectible. Buy or make an offer there if available;
        it may not be listed for sale. Purchasing does not unlock ownership in
        Casper yet.
      </p>
      <p className="mint">Asset: {c.collectible.mint}</p>
      <a
        className="source"
        href={c.collectible.inventorySource}
        target="_blank"
        rel="noopener noreferrer"
      >
        Collector Crypt source ↗
      </a>
    </>
  );
}
export function Rules() {
  return (
    <>
      <p className="eyebrow">THE RULES / ARENA V3</p>
      <h2>
        Three fighters.
        <br />
        Every move matters.
      </h2>
      <div className="rule-list">
        <p>
          <b>Build your team.</b> Pick 3 different cards within a total printed
          cost of 14. All fighters have 100 arena HP.
        </p>
        <p>
          <b>Attack.</b> Select your fighter and an enemy. Damage = 12 + printed
          power ÷ 1,500, rounded. Energy cost = printed cost ÷ 3, rounded up.
        </p>
        <p>
          <b>Support.</b> Add a ready teammate with combo power for +1 energy.
          Their combo power ÷ 1,000 becomes bonus damage.
        </p>
        <p>
          <b>Recover.</b> Attackers and supporters rest for your next turn.
          Charge gains up to 3 energy and reduces the next incoming hit by 25%.
          Your last standing fighter recovers every turn. Guard does not stack.
        </p>
        <p>
          <b>Manage energy.</b> Start at 4, recover 2 when your turn begins,
          hold up to 6. Charging always passes the turn.
        </p>
        <p>
          <b>Special attack.</b> Each fighter has a unique move, usable once per
          match. It costs extra energy, requires a ready fighter, and cannot use
          combo support. Read its effect below the attack button.
        </p>
        <p>
          <b>Win.</b> Knock out all three opponents. At 60 total turns, higher
          remaining team HP wins; equal HP is a draw.
        </p>
      </div>
      <p className="muted">
        Casper adapts printed stats. Card skills, color restrictions, and
        official deck mechanics are not active in this prototype. No collectible
        is won or lost.
      </p>
    </>
  );
}
