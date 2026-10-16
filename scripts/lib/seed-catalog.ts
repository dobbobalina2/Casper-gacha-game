import { readFileSync } from "node:fs";
import { catalogSchema } from "../../src/contracts/catalog.ts";

// Fixtures and balance baselines only. The application reads D1 through /api/catalog.
export const seedCards = catalogSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../db/seed/catalog.json", import.meta.url),
      "utf8",
    ),
  ),
);
