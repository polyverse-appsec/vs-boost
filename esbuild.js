// BUILD NOTICE: if you modify this file, you need to fully relaunch visual studio code for the changes to take effect
const { build } = require("esbuild");

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
};

// Config for extension source code (to be run in a Node-based context)
/** @type BuildOptions */
const extensionConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  entryPoints: ["./src/extension/extension.ts"],
  outfile: "./out/extension.js",
  external: ["vscode"],
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const summaryConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/dashboard/summary/main.ts"],
  outfile: "./out/dashboard/summary/main.js",
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const chatConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/dashboard/chat/main.ts"],
  outfile: "./out/dashboard/chat/main.js",
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const startConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/dashboard/start/main.ts"],
  outfile: "./out/dashboard/start/main.js",
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const markdownConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/dashboard/markdown/main.ts"],
  outfile: "./out/dashboard/markdown/main.js",
};

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
  watch: {
    onRebuild(error, result) {
      console.log("[watch] build started");
      if (error) {
        error.errors.forEach((error) =>
          console.error(
            `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
          )
        );
      } else {
        console.log("[watch] build finished");
      }
    },
  },
};

// Build script
(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--watch")) {
      // Build and watch extension and webview code
      console.log("[watch] build started");
      await build({
        ...extensionConfig,
        ...watchConfig,
      });
      await build({
        ...summaryConfig,
        ...watchConfig,
      });
      await build({
        ...chatConfig,
        ...watchConfig
      });
      await build({
        ...startConfig,
        ...watchConfig
      });
      await build({
        ...markdownConfig,
        ...watchConfig
      });
      console.log("[watch] build finished");
    } else {
      // Build extension and webview code
      await build(extensionConfig);
      await build(summaryConfig);
      await build(chatConfig);
      await build(startConfig);
      await build(markdownConfig);
      
      console.log("build complete");
    }
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();