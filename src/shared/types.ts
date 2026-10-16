import type { Action } from "./engine.ts";
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
}
export interface Replay {
  version: string;
  catalogRevision?: string;
  playerIds: string[];
  botIds: string[];
  actions: Action[];
}
