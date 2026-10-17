import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/server/db/schema.ts",
    "./src/server/db/auth-schema.ts",
    "./src/server/db/battle-schema.ts",
  ],
  out: "./db/migrations",
});
