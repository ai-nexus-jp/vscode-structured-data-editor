// @ts-check
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions[]} */
const configs = [
  {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    sourcemap: true,
  },
  {
    entryPoints: ["src/webview/main.ts"],
    outfile: "dist/webview.js",
    bundle: true,
    platform: "browser",
    format: "iife",
    sourcemap: false,
  },
];

async function main() {
  for (const config of configs) {
    if (watch) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    } else {
      await esbuild.build(config);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
