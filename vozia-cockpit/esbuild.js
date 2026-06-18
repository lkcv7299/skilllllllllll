const esbuild = require("esbuild");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
};

async function main() {
  if (process.argv.includes("--watch")) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log("Watching VozIA Cockpit...");
    return;
  }

  await esbuild.build(options);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

