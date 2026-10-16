import { build } from "esbuild";
await build({
  entryPoints: ["src/client/app.tsx"],
  bundle: true,
  outfile: "public/bundle.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
});
