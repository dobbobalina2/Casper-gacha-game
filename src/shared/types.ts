import type { Action } from "./engine.ts";
export interface Special {
  name: string;
  description: string;
  bonus: number;
  extraEnergy: number;
  pierce?: boolean;
  rage?: number;
  rageThreshold?: number;
  execute?: number;
  executeThreshold?: number;
  splash?: number;
  refund?: number;
  drain?: number;
  guard?: boolean;
  visual: string;
  color: string;
  notes: [number, number, number, number, OscillatorType, number][];
}
export interface Card {
  id: string;
  name: string;
  role: string;
  family: string;
  type: string;
  color: string;
  cost: number;
  power: number;
  comboPower: number | null;
  statsSource: string;
  verifiedAt: string;
  image: string;
  collectible: {
    mint: string;
    name: string;
    description: string;
    image: string;
    inventorySource: string;
    observedAt: string;
    mapping: string;
  };
  special: Special;
}
export interface Replay {
  version: string;
  catalogRevision?: string;
  playerIds: string[];
  botIds: string[];
  actions: Action[];
}
