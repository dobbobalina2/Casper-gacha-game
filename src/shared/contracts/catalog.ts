import { z } from "zod";

export const cardIdSchema = z.string().regex(/^(FB|SB|FS|FP)\d{2}-\d{3}$/);
export const mintSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const amount = z.number().int().min(0).max(100);
const label = z.string().trim().min(1).max(250);
const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const officialSource = httpsUrl.refine(
  (value) => new URL(value).hostname === "www.dbs-cardgame.com",
);
export const inventorySourceSchema = httpsUrl.refine((value) => {
  const url = new URL(value);
  return (
    url.origin === "https://gacha.collectorcrypt.com" &&
    url.pathname === "/api/getNfts"
  );
});
export const collectibleImageSchema = httpsUrl.refine((value) =>
  [
    "d1xpxki1g4htqu.cloudfront.net",
    "nft.collectorcrypt.com",
    "arweave.net",
  ].includes(new URL(value).hostname),
);

// Audio is data, never executable code. Bound duration, frequency and gain.
export const noteSchema = z.tuple([
  z.number().min(0).max(2),
  z.number().positive().max(2),
  z.number().min(20).max(20000),
  z.number().min(20).max(20000),
  z.enum(["sine", "square", "sawtooth", "triangle"]),
  z.number().min(0).max(0.5),
]);

export const specialSchema = z.strictObject({
  name: label,
  description: z.string().min(1).max(1000),
  bonus: amount,
  extraEnergy: z.number().int().min(0).max(3),
  pierce: z.boolean().default(false),
  rage: amount.default(0),
  rageThreshold: amount.default(0),
  execute: amount.default(0),
  executeThreshold: amount.default(0),
  splash: amount.default(0),
  refund: z.number().int().min(0).max(6).default(0),
  drain: z.number().int().min(0).max(6).default(0),
  guard: z.boolean().default(false),
  visual: z.enum([
    "wave",
    "spiral",
    "burst",
    "orb",
    "volley",
    "nova",
    "slash",
    "sword",
  ]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.array(noteSchema).min(1).max(8),
});

export const collectibleSchema = z.strictObject({
  mint: mintSchema,
  name: label,
  description: z.string().max(1000),
  image: collectibleImageSchema,
  inventorySource: inventorySourceSchema,
  observedAt: z.iso.date(),
  mapping: z.string().min(1).max(500),
});

export const cardSchema = z
  .strictObject({
    id: cardIdSchema,
    name: label,
    role: label,
    family: z.literal("Fusion World"),
    type: z.literal("BATTLE"),
    color: z.enum(["Red", "Blue", "Green", "Yellow", "Black"]),
    cost: z.number().int().min(0).max(12),
    power: z.number().int().positive().max(100000),
    comboPower: z.number().int().min(0).max(20000).nullable(),
    statsSource: officialSource,
    verifiedAt: z.iso.date(),
    image: z.string().regex(/^\/assets\/[A-Za-z0-9_-]+\.webp$/),
    collectible: collectibleSchema,
    special: specialSchema,
  })
  .refine(
    (card) => new URL(card.statsSource).searchParams.get("card_no") === card.id,
    {
      message: "Official source must identify the same card number",
    },
  )
  .refine(
    (card) =>
      Math.max(1, Math.ceil(card.cost / 3)) + card.special.extraEnergy <= 6,
    {
      message: "Special must fit the arena energy cap",
    },
  );

export const catalogSchema = z
  .array(cardSchema)
  .min(3)
  .max(500)
  .superRefine((cards, ctx) => {
    const ids = new Set<string>();
    const mints = new Set<string>();
    for (const [index, card] of cards.entries()) {
      if (ids.has(card.id) || mints.has(card.collectible.mint)) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "Duplicate card or reference collectible",
        });
      }
      ids.add(card.id);
      mints.add(card.collectible.mint);
    }
  });

export const catalogResponseSchema = z.strictObject({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  cards: catalogSchema,
});

export type Card = z.infer<typeof cardSchema>;
export type Special = z.infer<typeof specialSchema>;
export type Collectible = z.infer<typeof collectibleSchema>;
