import type { Side } from "../shared/engine.ts";

export type CombatEvent = {
  type: "charge" | "attack";
  side: Side;
  energy?: number;
  damage?: number;
  guarded?: boolean;
  ko?: boolean;
  combo?: boolean;
  fighter?: string;
  target?: string;
  support?: string | null;
};

type EffectsOptions = {
  root: HTMLElement;
  soundButton: HTMLButtonElement;
  volumeInput: HTMLInputElement;
};
type AudioContextWindow = { webkitAudioContext?: typeof AudioContext };

// Presentation never changes combat state. Audio starts only after a user gesture.
export function createEffects({
  root,
  soundButton,
  volumeInput,
}: EffectsOptions) {
  const key = "casper-audio-v1";
  let enabled = true,
    volume = 0.35,
    context: AudioContext | null = null,
    master: GainNode | null = null;
  let animations: Animation[] = [],
    nodes = new Set<OscillatorNode>(),
    overlays: HTMLElement[] = [],
    generation = 0;
  try {
    const stored = localStorage.getItem(key);
    const saved: unknown = stored ? JSON.parse(stored) : null;
    if (
      saved &&
      typeof saved === "object" &&
      "enabled" in saved &&
      "volume" in saved
    ) {
      enabled = saved.enabled !== false;
      if (typeof saved.volume === "number" && Number.isFinite(saved.volume))
        volume = Math.max(0, Math.min(1, saved.volume));
    }
  } catch {}
  function sync() {
    soundButton.textContent = enabled ? "Sound on" : "Sound off";
    soundButton.setAttribute("aria-pressed", String(enabled));
    soundButton.title = enabled ? "Mute battle sounds" : "Enable battle sounds";
    volumeInput.value = String(Math.round(volume * 100));
    if (master && context)
      master.gain.setValueAtTime(enabled ? volume : 0, context.currentTime);
    try {
      localStorage.setItem(key, JSON.stringify({ enabled, volume }));
    } catch {}
  }
  async function unlock() {
    if (!enabled) return;
    try {
      let audio = context;
      if (!audio) {
        const Audio =
          window.AudioContext ||
          (window as AudioContextWindow).webkitAudioContext;
        if (!Audio) throw new Error("Audio unavailable");
        audio = new Audio();
        context = audio;
        master = audio.createGain();
        master.connect(audio.destination);
        sync();
      }
      if (audio.state === "suspended") await audio.resume();
      soundButton.dataset.audioState = audio.state;
    } catch {
      soundButton.dataset.audioState = "unavailable";
      soundButton.title = "Audio unavailable in this browser";
    }
  }
  const onSoundClick = () => {
    enabled = !enabled;
    sync();
    if (enabled) void unlock();
  };
  const onVolumeInput = () => {
    volume = Number(volumeInput.value) / 100;
    sync();
    void unlock();
  };
  const onGesture = () => void unlock();
  soundButton.addEventListener("click", onSoundClick);
  volumeInput.addEventListener("input", onVolumeInput);
  document.addEventListener("pointerdown", onGesture, { passive: true });
  document.addEventListener("keydown", onGesture);
  sync();
  function tone(
    start: number,
    duration: number,
    from: number,
    to: number,
    type: OscillatorType = "sine",
    level = 0.2,
  ) {
    if (!context || !master) return;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    nodes.add(oscillator);
    oscillator.onended = () => {
      nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
  function sound(event: CombatEvent) {
    if (!enabled || !context || context.state !== "running") return;
    const t = context.currentTime;
    try {
      if (event.type === "charge") {
        tone(t, 0.32, 140, 520, "sine", 0.16);
        tone(t + 0.08, 0.3, 210, 780, "sine", 0.09);
      } else {
        tone(t, 0.14, event.combo ? 680 : 440, 100, "sawtooth", 0.08);
        tone(t + 0.1, 0.23, 110, 35, "sine", 0.4);
        if (event.combo) tone(t + 0.06, 0.18, 880, 160, "triangle", 0.15);
        if (event.ko) tone(t + 0.16, 0.32, 180, 28, "triangle", 0.22);
      }
    } catch {
      /* Audio failure must never interrupt a match. */
    }
  }
  function animate(
    el: Element | null | undefined,
    frames: Keyframe[],
    options: KeyframeAnimationOptions = {},
  ) {
    if (!el) return;
    const animation = el.animate(frames, {
      duration: 440,
      easing: "ease-out",
      ...options,
    });
    animations.push(animation);
    return animation;
  }
  function cancel() {
    generation++;
    for (const a of animations) a.cancel();
    animations = [];
    overlays.forEach((el) => el.remove());
    overlays = [];
    for (const node of nodes) {
      try {
        node.stop();
      } catch {}
    }
    nodes.clear();
  }
  async function play(event: CombatEvent) {
    cancel();
    const current = generation;
    sound(event);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const card = (side: Side | "opponent", id: string | undefined) =>
      id
        ? [
            ...root.querySelectorAll<HTMLElement>(
              side === "player" ? "[data-fighter]" : "[data-target]",
            ),
          ].find((el) => (el.dataset.fighter || el.dataset.target) === id)
        : undefined;
    const float = (el: Element | undefined, text: string) => {
      if (!el) return;
      const label = document.createElement("span");
      label.className = "battle-float";
      label.textContent = text;
      label.setAttribute("aria-hidden", "true");
      el.appendChild(label);
      overlays.push(label);
      animate(
        label,
        reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 0, transform: "translate(-50%,8px) scale(.7)" },
              {
                opacity: 1,
                transform: "translate(-50%,-12px) scale(1.12)",
                offset: 0.25,
              },
              { opacity: 0, transform: "translate(-50%,-45px) scale(1)" },
            ],
        { duration: reduced ? 120 : 480 },
      );
    };
    try {
      if (event.type === "charge") {
        const fighters = [
          ...root.querySelectorAll(
            event.side === "player"
              ? ".own .fighter:not(.knocked)"
              : ".enemy .fighter:not(.knocked)",
          ),
        ];
        fighters.forEach((el) => {
          if (!reduced)
            animate(el, [
              { boxShadow: "0 0 0 0 #b1db7400" },
              { boxShadow: "0 0 25px 4px #b1db7490", offset: 0.4 },
              { boxShadow: "0 0 0 0 #b1db7400" },
            ]);
        });
        float(fighters[0], `+${event.energy} ENERGY`);
      } else {
        const from = card(event.side, event.fighter),
          to = card(event.side === "player" ? "bot" : "player", event.target);
        if (!reduced) {
          animate(from, [
            { transform: "translateY(0)" },
            {
              transform: `translateY(${event.side === "player" ? "-" : "+"}12px) scale(1.04)`,
              offset: 0.3,
            },
            { transform: "translateY(0)" },
          ]);
          if (event.support)
            animate(card(event.side, event.support), [
              { filter: "brightness(1)" },
              { filter: "brightness(1.8)", offset: 0.3 },
              { filter: "brightness(1)" },
            ]);
          animate(to, [
            { transform: "translateX(0)", filter: "brightness(1)" },
            {
              transform: "translateX(7px)",
              filter: "brightness(2)",
              offset: 0.3,
            },
            { transform: "translateX(-6px)", offset: 0.5 },
            {
              transform: "translateX(0)",
              filter: event.ko ? "grayscale(1)" : "brightness(1)",
            },
          ]);
          if (from && to) {
            const a = from.getBoundingClientRect(),
              b = to.getBoundingClientRect(),
              x = a.left + a.width / 2,
              y = a.top + a.height / 2,
              dx = b.left + b.width / 2 - x,
              dy = b.top + b.height / 2 - y;
            const beam = document.createElement("span");
            beam.className = `attack-beam ${event.combo ? "combo-beam" : ""}`;
            Object.assign(beam.style, {
              left: `${x}px`,
              top: `${y}px`,
              width: `${Math.hypot(dx, dy)}px`,
              rotate: `${Math.atan2(dy, dx)}rad`,
            });
            document.body.appendChild(beam);
            overlays.push(beam);
            animate(
              beam,
              [
                { opacity: 0, scale: "0 1" },
                { opacity: 1, scale: "1 1", offset: 0.3 },
                { opacity: 0, scale: "1 0" },
              ],
              { duration: 300 },
            );
          }
        }
        float(
          to,
          `${event.guarded ? "BLOCK · " : ""}−${event.damage}${event.ko ? " · KO" : ""}`,
        );
      }
      await Promise.allSettled(animations.map((a) => a.finished));
    } finally {
      if (current === generation) {
        animations.forEach((a) => a.cancel());
        animations = [];
        overlays.forEach((el) => el.remove());
        overlays = [];
      }
    }
  }
  function dispose() {
    cancel();
    soundButton.removeEventListener("click", onSoundClick);
    volumeInput.removeEventListener("input", onVolumeInput);
    document.removeEventListener("pointerdown", onGesture);
    document.removeEventListener("keydown", onGesture);
    if (master) master.disconnect();
    if (context) void context.close();
    context = null;
    master = null;
  }
  return { play, cancel, dispose };
}
