import type { CSSProperties } from "react";
import type { Card } from "../../shared/types.ts";
import { RULES, teamCost, validateTeam } from "../../shared/engine.ts";

export const short = (value: number) => `${value / 1000}K`;
export const accentStyle = (name: string, value: string): CSSProperties => ({
  [name]: value,
});
interface Props {
  cards: Card[];
  selected: string[];
  onPick(id: string): void;
  onDetail(card: Card): void;
  onStart(): void;
  onRecommended(): void;
}
function RosterCard({
  card: c,
  index,
  chosen,
  onPick,
  onDetail,
}: {
  card: Card;
  index: number;
  chosen: boolean;
  onPick(id: string): void;
  onDetail(card: Card): void;
}) {
  return (
    <article
      className={`roster-card ${chosen ? "chosen" : ""}`}
      style={accentStyle(
        "--card-accent",
        c.color === "Green"
          ? "#b1db74"
          : c.color === "Red"
            ? "#ff785e"
            : "#80bafa",
      )}
    >
      <button
        className="card-pick"
        data-pick={c.id}
        aria-pressed={chosen}
        aria-label={`${chosen ? "Remove" : "Add"} ${c.name} ${c.id}`}
        onClick={() => onPick(c.id)}
      >
        <div className="card-topline">
          <span>{c.id}</span>
          <span className="pick-marker">{chosen ? "✓" : "+"}</span>
        </div>
        <div className="roster-art">
          <span className="card-index">0{index + 1}</span>
          <img
            src={c.image}
            alt={c.collectible.name}
            loading={index > 2 ? "lazy" : undefined}
          />
        </div>
        <div className="card-title">
          <span>{c.role}</span>
          <h3>{c.name}</h3>
        </div>
        <div className="stats">
          <div>
            <span>POWER</span>
            <b>{short(c.power)}</b>
          </div>
          <div>
            <span>COMBO</span>
            <b>{c.comboPower === null ? "—" : `+${short(c.comboPower)}`}</b>
          </div>
          <div>
            <span>COST</span>
            <b>{c.cost}</b>
          </div>
        </div>
      </button>
      <button className="card-source" onClick={() => onDetail(c)}>
        Card details &amp; sources <span>↗</span>
      </button>
    </article>
  );
}
export function Lobby({
  cards,
  selected,
  onPick,
  onDetail,
  onStart,
  onRecommended,
}: Props) {
  const team = selected
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => !!c);
  const cost = teamCost(team),
    error = validateTeam(selected, cards);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="orange">●</span> DRAGON BALL / FUSION WORLD
          </p>
          <h1>
            POWER IS NOTHING
            <br />
            WITHOUT A <em>PLAN.</em>
          </h1>
          <p>Build your trio. Find the opening. Make every card count.</p>
          <div className="hero-tags">
            <span>3 vs 3</span>
            <span>TURN-BASED</span>
            <span>REAL CARD STATS</span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit" />
          <span className="hero-kanji">闘</span>
          <img
            className="hero-back"
            src={cards.find((c) => c.id === "SB02-043")?.image}
            alt=""
          />
          <img
            className="hero-front"
            src={cards.find((c) => c.id === "FB05-030")?.image}
            alt=""
          />
          <span className="hero-stamp">
            THE ARENA
            <br />
            IS YOURS.
          </span>
        </div>
      </section>
      <div className="lobby-grid">
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / BUILD YOUR LINEUP</p>
              <h2>
                Choose your fighters
                <span className="count">
                  {String(cards.length).padStart(2, "0")}
                </span>
              </h2>
            </div>
            <span className="subtle-label">CURATED PRACTICE ROSTER</span>
          </div>
          <div className="roster-grid">
            {cards.map((c, i) => (
              <RosterCard
                key={c.id}
                card={c}
                index={i}
                chosen={selected.includes(c.id)}
                onPick={onPick}
                onDetail={onDetail}
              />
            ))}
          </div>
          <p className="roster-note">
            Collectible images from Collector Crypt · Stats matched to Bandai ·
            Snapshot October 16, 2026
          </p>
        </section>
        <aside className="squad">
          <div className="squad-heading">
            <p className="eyebrow">YOUR CORNER</p>
            <span>{selected.length} / 3</span>
          </div>
          <h2>The starting three.</h2>
          <p className="muted">
            Mix efficient attackers with combo support. Bigger power costs more.
          </p>
          <div className="team-slots">
            {Array.from({ length: 3 }, (_, i) => {
              const c = team[i];
              return (
                <div key={i} className={`team-slot ${c ? "filled" : ""}`}>
                  <span className="slot-number">0{i + 1}</span>
                  {c ? (
                    <>
                      <img src={c.image} alt="" />
                      <div>
                        <b>{c.name}</b>
                        <small>
                          {c.id} · Cost {c.cost}
                        </small>
                      </div>
                      <button
                        onClick={() => onPick(c.id)}
                        aria-label={`Remove ${c.name} from team`}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <span>Choose a fighter</span>
                      <span className="slot-plus">+</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="budget">
            <span>TEAM COST</span>
            <b>
              {cost} <small>/ {RULES.budget}</small>
            </b>
          </div>
          <div className="budget-track">
            <i style={{ width: `${(cost / RULES.budget) * 100}%` }} />
          </div>
          <p className="team-help">
            {error || "Your team is ready. Step into the arena."}
          </p>
          <button
            className="button primary start"
            disabled={!!error}
            onClick={onStart}
          >
            Enter the arena <span>↗</span>
          </button>
          <button className="text-button recommended" onClick={onRecommended}>
            Use recommended team
          </button>
          <div className="opponent-note">
            <span className="bot-dot">✦</span>
            <div>
              <b>Training partner</b>
              <small>A bot with the same rules. No stakes.</small>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
