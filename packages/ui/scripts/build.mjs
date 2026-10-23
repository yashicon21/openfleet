import { build } from "esbuild";

await build({
  entryPoints: [new URL("../src/app/main.ts", import.meta.url).pathname],
  outfile: new URL("../dist/renderer.js", import.meta.url).pathname,
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  legalComments: "inline",
  logLevel: "warning",
});
