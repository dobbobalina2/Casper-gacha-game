import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist/client", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("public", "dist/client", { recursive: true });
await cp("src/client/index.html", "dist/client/index.html");
await cp("src/client/styles.css", "dist/client/styles.css");
await build({
  entryPoints: ["src/client/main.tsx"],
  outfile: "dist/client/app.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  minify: true,
});
// This bundle also powers integration tests in the real local D1 runtime.
await build({
  entryPoints: ["src/server/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["node:*"],
});
