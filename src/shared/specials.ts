import type { Card, Special } from "./types.ts";

const profiles: Record<string, Special> = {
  "FB05-030": {
    name: "Kamehameha",
    description: "A focused blue beam. +16 damage.",
    bonus: 16,
    extraEnergy: 1,
    visual: "wave",
    color: "#69d9ff",
    notes: [
      [0, 0.24, 180, 650, "sine", 0.18],
      [0.18, 0.36, 700, 120, "sawtooth", 0.1],
    ],
  },
  "SB02-043": {
    name: "Special Beam Cannon",
    description: "A piercing spiral. +10 damage and ignores guard.",
    bonus: 10,
    pierce: true,
    extraEnergy: 1,
    visual: "spiral",
    color: "#dca4ff",
    notes: [
      [0, 0.18, 800, 1300, "triangle", 0.12],
      [0.16, 0.32, 1600, 220, "sawtooth", 0.08],
    ],
  },
  "FB01-140": {
    name: "Masenko",
    description: "+12 damage, or +30 when Gohan has 50 HP or less.",
    bonus: 12,
    rage: 18,
    rageThreshold: 50,
    extraEnergy: 1,
    visual: "burst",
    color: "#ffe56b",
    notes: [
      [0, 0.18, 260, 780, "square", 0.07],
      [0.12, 0.36, 560, 90, "triangle", 0.22],
    ],
  },
  "FB06-120": {
    name: "Eraser Cannon",
    description: "+5 damage. Hits every other standing enemy for 12.",
    bonus: 5,
    splash: 12,
    extraEnergy: 2,
    visual: "orb",
    color: "#9cff68",
    notes: [
      [0, 0.28, 65, 150, "sawtooth", 0.12],
      [0.22, 0.4, 180, 28, "sine", 0.35],
    ],
  },
  "FB09-012": {
    name: "Cover Fire",
    description: "+8 damage. Refunds 2 energy and guards your team.",
    bonus: 8,
    refund: 2,
    guard: true,
    extraEnergy: 1,
    visual: "volley",
    color: "#ff8ec8",
    notes: [
      [0, 0.1, 900, 180, "square", 0.07],
      [0.12, 0.1, 1100, 220, "square", 0.07],
      [0.24, 0.12, 1300, 260, "square", 0.07],
    ],
  },
  "FB05-119": {
    name: "Spirit Bomb",
    description: "+14 damage. Hits every other standing enemy for 6.",
    bonus: 14,
    splash: 6,
    extraEnergy: 2,
    visual: "nova",
    color: "#a9f4ff",
    notes: [
      [0, 0.32, 100, 400, "sine", 0.2],
      [0.12, 0.3, 150, 600, "sine", 0.1],
      [0.3, 0.36, 90, 30, "triangle", 0.25],
    ],
  },
  "SB02-010": {
    name: "Burning Slash",
    description: "+12 damage, plus 18 against a target at 40 HP or less.",
    bonus: 12,
    execute: 18,
    executeThreshold: 40,
    extraEnergy: 1,
    visual: "slash",
    color: "#ffae66",
    notes: [
      [0, 0.14, 1200, 180, "sawtooth", 0.12],
      [0.16, 0.17, 800, 80, "triangle", 0.2],
    ],
  },
  "FB02-061": {
    name: "Spirit Sword",
    description: "+10 damage. Drain 2 enemy energy after the hit.",
    bonus: 10,
    drain: 2,
    extraEnergy: 1,
    visual: "sword",
    color: "#78a7ff",
    notes: [
      [0, 0.2, 320, 960, "triangle", 0.16],
      [0.18, 0.3, 1150, 340, "sine", 0.2],
    ],
  },
};
export const specialFor = (card: Card | null | undefined): Special | null =>
  card ? (profiles[card.id] ?? null) : null;
export const specialCost = (card: Card): number =>
  Math.max(1, Math.ceil(card.cost / 3)) + (specialFor(card)?.extraEnergy ?? 0);
