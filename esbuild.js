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

console.log(
    "Source Mapping is " +
        (process.env.NODE_ENV !== "production" ? "enabled" : "disabled") +
        "\n"
);

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

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
    watch: {
        onRebuild(error, result) {
            // this casing cannot be changed, it is a convention of the esbuild-problem-matchers extension
            console.log("[watch] build started");
            if (error) {
                error.errors.forEach((error) =>
                    console.error(
                        `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
                    )
                );
            } else {
                // this casing cannot be changed, it is a convention of the esbuild-problem-matchers extension
                console.log("[watch] build finished");
            }
        },
    },
};

const dashboardConfigs = [
    "dashboard/chat/main",
    "dashboard/summary/main",
    "dashboard/markdown/main",
    "dashboard/start/main",
].map((entry) => ({
    ...baseConfig,
    target: "es2020",
    format: "esm",
    entryPoints: [`./src/${entry}.ts`],
    outfile: `./out/${entry}.js`,
}));

// Build script
(async () => {
    const args = process.argv.slice(2);
    try {
        if (args.includes("--watch")) {
            // Build and watch extension and webview code
            // this casing cannot be changed, it is a convention of the esbuild-problem-matchers extension
            console.log("[watch] build started");
            await build({
                ...extensionConfig,
                ...watchConfig,
            });

            for (const config of dashboardConfigs) {
                await build({
                    ...config,
                    ...watchConfig,
                });
            }

            // this casing cannot be changed, it is a convention of the esbuild-problem-matchers extension
            console.log("[watch] build finished");
        } else {
            // Build extension
            await build(extensionConfig);
            console.log("Extension Build Complete");

            // Build webview code
            for (const config of dashboardConfigs) {
                await build(config);
            }
            console.log("Webview Build Complete");
        }
    } catch (err) {
        process.stderr.write(err.message + "\n" + err.stack);
        process.exit(1);
    }
})();
