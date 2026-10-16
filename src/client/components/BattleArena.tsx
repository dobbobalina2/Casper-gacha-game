import { useState } from "react";
import {
  RULES,
  actionError,
  attackCost,
  damageFor,
  type Action,
  type Fighter,
  type MatchState,
  type Side,
} from "../../shared/engine.ts";
import { short, accentStyle } from "./Lobby.tsx";

interface Props {
  state: MatchState;
  resolving: boolean;
  onAction(action: Action): void;
  onLeave(): void;
  onRematch(): void;
}
function Energy({ state, side }: { state: MatchState; side: Side }) {
  return (
    <div
      className="energy"
      aria-label={`${side === "player" ? "Your" : "Bot"} energy ${state[side].energy} of 6`}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className={i < state[side].energy ? "full" : ""} />
      ))}
      <b>
        {state[side].energy}
        <span>/6</span>
      </b>
    </div>
  );
}
function FighterCard({
  card: c,
  side,
  chosen,
  disabled,
  onSelect,
}: {
  card: Fighter;
  side: Side;
  chosen: boolean;
  disabled: boolean;
  onSelect(): void;
}) {
  const own = side === "player";
  return (
    <button
      className={`fighter ${chosen ? "active" : ""} ${c.hp <= 0 ? "knocked" : ""} ${c.rest > 0 ? "resting" : ""}`}
      data-fighter={own ? c.id : undefined}
      data-target={!own ? c.id : undefined}
      disabled={disabled}
      aria-pressed={chosen}
      aria-label={`${own ? "Select fighter" : "Target"} ${c.name} ${c.id}, ${c.hp} HP${c.rest > 0 ? ", resting" : ""}`}
      onClick={onSelect}
    >
      <div className="fighter-status">
        <span>
          {c.hp <= 0
            ? "KNOCKED OUT"
            : c.rest > 0
              ? "RECOVERING"
              : own
                ? "READY"
                : "OPPONENT"}
        </span>
        <b>
          {c.hp}
          <small> HP</small>
        </b>
      </div>
      <div className="fighter-art">
        <img src={c.image} alt="" />
        <span className="target-mark">
          {chosen ? (own ? "ATTACKER" : "TARGET") : ""}
        </span>
      </div>
      <h3>{c.name}</h3>
      <div className="hp-track">
        <i style={{ width: `${c.hp}%` }} />
      </div>
      <div className="fighter-bottom">
        <span>{short(c.power)} PWR</span>
        <span>{attackCost(c)} ENERGY</span>
      </div>
    </button>
  );
}
export function BattleArena({
  state,
  resolving,
  onAction,
  onLeave,
  onRematch,
}: Props) {
  const [selectedAttacker, setAttacker] = useState<string | null>(null);
  const [selectedTarget, setTarget] = useState<string | null>(null);
  const [selectedSupport, setSupport] = useState<string | null>(null);
  const readyFighters = state.player.fighters.filter(
    (c) => c.hp > 0 && c.rest === 0,
  );
  const fighter =
    readyFighters.find((c) => c.id === selectedAttacker) ?? readyFighters[0];
  const target =
    state.bot.fighters.find((c) => c.id === selectedTarget && c.hp > 0) ??
    state.bot.fighters.find((c) => c.hp > 0);
  const supporters = readyFighters.filter(
    (c) => c.id !== fighter?.id && (c.comboPower ?? 0) > 0,
  );
  const support = supporters.find((c) => c.id === selectedSupport);
  const mine = state.turn === "player" && !state.winner && !resolving;
  const attack: Action = {
    type: "attack",
    fighter: fighter?.id ?? "",
    target: target?.id ?? "",
    support: support?.id ?? null,
  };
  const error = actionError(state, "player", attack);
  const title = state.winner
    ? state.winner === "player"
      ? "VICTORY."
      : state.winner === "draw"
        ? "A PERFECT MATCH."
        : "ROUND TO THE BOT."
    : resolving
      ? "CLASH!"
      : mine
        ? "YOUR MOVE."
        : "BOT’S MOVE.";
  const health = (side: Side) =>
    state[side].fighters.reduce((n, c) => n + c.hp, 0);
  function act(action: Action) {
    setSupport(null);
    onAction(action);
  }
  return (
    <>
      <section className="battle-heading">
        <div>
          <p className="eyebrow">DRAGON BALL / PRACTICE ARENA</p>
          <h1>{title}</h1>
        </div>
        <div className="battle-meta">
          <span>
            TURN <b>{state.move}</b> / {RULES.turnLimit}
          </span>
          <button className="text-button leave" onClick={onLeave}>
            {state.winner ? "Change team" : "Leave match"} ↗
          </button>
        </div>
      </section>
      {state.winner && (
        <div className="result-banner" role="status">
          <div>
            <b>
              {state.winner === "player"
                ? "Good reads. Great team."
                : state.winner === "draw"
                  ? "Neither side gave an inch."
                  : "A new lineup. A different outcome."}
            </b>
            <span>
              You {health("player")} HP · Bot {health("bot")} HP · Practice
              result only
            </span>
          </div>
          <button className="button primary rematch" onClick={onRematch}>
            Play again ↗
          </button>
        </div>
      )}
      <div className="battle-grid">
        <section className="battle-board">
          {(["bot", "player"] as const).map((side, i) => (
            <div key={side}>
              {i === 1 && (
                <div className="arena-divider">
                  <span />
                  <b>VS</b>
                  <span />
                </div>
              )}
              <div className="side-label">
                <div>
                  <span className={side === "bot" ? "bot-dot" : "player-dot"}>
                    {side === "bot" ? "✦" : "●"}
                  </span>
                  <b>{side === "bot" ? "TRAINING PARTNER" : "YOUR TEAM"}</b>
                  <span className="guard">
                    {state[side].guarded ? "GUARD ACTIVE" : ""}
                  </span>
                </div>
                <Energy state={state} side={side} />
              </div>
              <div className={`fighters ${side === "bot" ? "enemy" : "own"}`}>
                {state[side].fighters.map((c) => (
                  <FighterCard
                    key={c.id}
                    card={c}
                    side={side}
                    chosen={
                      c.id === (side === "player" ? fighter?.id : target?.id)
                    }
                    disabled={
                      !mine || c.hp <= 0 || (side === "player" && c.rest > 0)
                    }
                    onSelect={() =>
                      side === "player" ? setAttacker(c.id) : setTarget(c.id)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
        <aside className="command-panel">
          <p className="eyebrow">
            {state.winner ? "MATCH COMPLETE" : "02 / MAKE YOUR MOVE"}
          </p>
          <h2>{state.winner ? "Run it back." : "Find an opening."}</h2>
          <p className="muted">
            {state.winner
              ? "Try another team or play this matchup again."
              : mine
                ? "Choose your fighter, then an opponent. Add support to hit harder."
                : resolving
                  ? "The attack is resolving…"
                  : "Your training partner is choosing a move…"}
          </p>
          <div className="command-preview">
            <span>{fighter?.name ?? "No ready fighter"}</span>
            <b>
              {fighter && target ? damageFor(state, "player", attack) : "—"}
              <small> DAMAGE</small>
            </b>
            <p>
              {target ? `→ ${target.name}` : "No target"}
              {state.bot.guarded ? " · Guarded" : ""}
            </p>
          </div>
          <div className="support-heading">
            <b>COMBO SUPPORT</b>
            <span>+1 ENERGY</span>
          </div>
          <div className="support-options">
            <button
              data-support=""
              className={!support ? "selected" : ""}
              disabled={!mine}
              onClick={() => setSupport(null)}
            >
              Solo attack
            </button>
            {supporters.map((c) => (
              <button
                key={c.id}
                data-support={c.id}
                className={support?.id === c.id ? "selected" : ""}
                disabled={!mine}
                onClick={() => setSupport(c.id)}
              >
                {c.name} <b>+{(c.comboPower ?? 0) / 1000}</b>
              </button>
            ))}
          </div>
          <button
            className="button primary attack"
            disabled={!mine || !!error}
            onClick={() => act(attack)}
          >
            Attack{" "}
            <span>
              {fighter ? attackCost(fighter) + (support ? 1 : 0) : 0} energy ↗
            </span>
          </button>
          <button
            className="button secondary charge"
            disabled={!mine}
            onClick={() => act({ type: "charge" })}
          >
            Charge &amp; guard <span>+3 energy</span>
          </button>
          <p className="action-help">
            {state.winner
              ? "Match finished."
              : mine
                ? error ||
                  "Rotate fighters. Your last survivor recovers every turn."
                : "Your turn begins after the bot moves."}
          </p>
          <div className="battle-log" id="battle-log">
            <p className="eyebrow">BATTLE LOG</p>
            <ol>
              {state.log.length ? (
                state.log
                  .slice(-5)
                  .reverse()
                  .map((l, i) => (
                    <li key={`${l.move}-${l.side}-${i}`}>
                      <span>
                        {String(l.move).padStart(2, "0")} /{" "}
                        {l.side === "player"
                          ? "YOU"
                          : l.side === "bot"
                            ? "BOT"
                            : "END"}
                      </span>
                      {l.text}
                    </li>
                  ))
              ) : (
                <li>The arena is set. Make the first move.</li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
