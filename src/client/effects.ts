import type { Side } from "../shared/engine.ts";
import type { Special } from "../shared/types.ts";

export type CombatEvent = {
  type: "charge" | "attack" | "special";
  side: Side;
  energy?: number;
  damage?: number;
  guarded?: boolean;
  ko?: boolean;
  combo?: boolean;
  fighter?: string;
  target?: string;
  support?: string | null;
  special?: Special;
  splashHits?: { id: string; damage: number; ko: boolean }[];
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
      if (event.special) {
        for (const [delay, duration, from, to, type, level] of event.special
          .notes)
          tone(t + delay, duration, from, to, type, level);
        if (event.ko) tone(t + 0.35, 0.25, 130, 30, "triangle", 0.22);
      } else if (event.type === "charge") {
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
  function specialVisual(from: Element, to: Element, special: Special) {
    const a = from.getBoundingClientRect(),
      b = to.getBoundingClientRect(),
      x = a.left + a.width / 2,
      y = a.top + a.height / 2,
      tx = b.left + b.width / 2,
      ty = b.top + b.height / 2,
      dx = tx - x,
      dy = ty - y;
    const shape = (
      kind: string,
      left: number,
      top: number,
      width: number,
      height: number,
      rotation = 0,
    ) => {
      const el = document.createElement("span");
      el.className = "special-particle " + kind;
      Object.assign(el.style, {
        left: left + "px",
        top: top + "px",
        width: width + "px",
        height: height + "px",
        rotate: rotation + "rad",
        color: special.color,
        backgroundColor: special.color,
      });
      document.body.appendChild(el);
      overlays.push(el);
      return el;
    };
    const beam = (thickness: number, offset = 0) =>
      shape(
        "special-ray",
        x + offset,
        y,
        Math.hypot(dx, dy),
        thickness,
        Math.atan2(dy, dx),
      );
    const ring = (radius: number, delay = 0) => {
      const el = shape(
        "special-ring",
        tx - radius / 2,
        ty - radius / 2,
        radius,
        radius,
      );
      animate(
        el,
        [
          { opacity: 0, scale: ".2" },
          { opacity: 0.8, offset: 0.35 },
          { opacity: 0, scale: "1.5" },
        ],
        { duration: 600, delay },
      );
    };
    if (special.visual === "wave") {
      animate(
        beam(24),
        [
          { opacity: 0, scale: "0 .2" },
          { opacity: 1, scale: "1 1", offset: 0.45 },
          { opacity: 0, scale: "1 .1" },
        ],
        { duration: 650 },
      );
      ring(100);
    }
    if (special.visual === "spiral") {
      const ray = beam(8);
      ray.style.background =
        "repeating-linear-gradient(90deg," +
        special.color +
        " 0 12px,#fff 12px 20px)";
      animate(
        ray,
        [
          { opacity: 0, scale: "0 1" },
          { opacity: 1, scale: "1 1", offset: 0.3 },
          { opacity: 0, scale: "1 .3" },
        ],
        { duration: 600 },
      );
      ring(75);
      ring(110, 80);
    }
    if (special.visual === "burst") {
      for (const offset of [-15, 0, 15])
        animate(
          beam(10, offset),
          [
            { opacity: 0, scale: "0 1" },
            { opacity: 1, scale: "1 1", offset: 0.45 },
            { opacity: 0, scale: "1 0" },
          ],
          { duration: 620 },
        );
      ring(145);
    }
    if (["orb", "nova"].includes(special.visual)) {
      const size = special.visual === "nova" ? 76 : 46,
        orb = shape("special-orb", x - size / 2, y - size / 2, size, size);
      animate(
        orb,
        [
          { opacity: 0, transform: "scale(.2)" },
          { opacity: 1, transform: "scale(1)", offset: 0.3 },
          {
            opacity: 1,
            transform: "translate(" + dx + "px," + dy + "px) scale(1.2)",
            offset: 0.75,
          },
          {
            opacity: 0,
            transform: "translate(" + dx + "px," + dy + "px) scale(2)",
          },
        ],
        { duration: 720 },
      );
      ring(special.visual === "nova" ? 170 : 115, 100);
    }
    if (special.visual === "volley") {
      for (let i = 0; i < 3; i++) {
        const pellet = shape("special-orb", x - 6 + i * 10, y, 12, 12);
        animate(
          pellet,
          [
            { opacity: 1, transform: "translate(0,0)" },
            {
              opacity: 1,
              transform: "translate(" + dx + "px," + dy + "px)",
              offset: 0.8,
            },
            {
              opacity: 0,
              transform: "translate(" + dx + "px," + dy + "px) scale(2)",
            },
          ],
          { duration: 380, delay: i * 100 },
        );
      }
    }
    if (["slash", "sword"].includes(special.visual)) {
      for (let i = 0; i < (special.visual === "slash" ? 2 : 1); i++) {
        const blade = shape(
          "special-ray",
          tx - 65,
          ty + (i ? 30 : -30),
          150,
          special.visual === "sword" ? 12 : 5,
          i ? -0.65 : 0.65,
        );
        animate(
          blade,
          [
            { opacity: 0, scale: "0 1" },
            { opacity: 1, scale: "1 1", offset: 0.4 },
            { opacity: 0, scale: "1.2 .1" },
          ],
          { duration: 500, delay: i * 100 },
        );
      }
      ring(100);
    }
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
      if (event.special) {
        const banner = document.createElement("div");
        banner.className = "special-callout";
        banner.textContent = event.special.name;
        banner.style.color = event.special.color;
        banner.setAttribute("aria-hidden", "true");
        root.appendChild(banner);
        overlays.push(banner);
        animate(
          banner,
          reduced
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [
                { opacity: 0, transform: "translate(-50%,10px) scale(.9)" },
                {
                  opacity: 1,
                  transform: "translate(-50%,0) scale(1)",
                  offset: 0.2,
                },
                { opacity: 1, offset: 0.75 },
                { opacity: 0, transform: "translate(-50%,-8px) scale(1.05)" },
              ],
          { duration: reduced ? 160 : 750 },
        );
      }
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
          if (from && to && event.special)
            specialVisual(from, to, event.special);
          if (from && to && !event.special) {
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
        for (const hit of event.splashHits || [])
          float(
            card(event.side === "player" ? "bot" : "player", hit.id),
            `−${hit.damage}${hit.ko ? " · KO" : ""}`,
          );
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
