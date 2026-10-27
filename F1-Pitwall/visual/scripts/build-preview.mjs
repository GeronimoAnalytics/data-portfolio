// Builds harness/dist (app.js + visual.css) for the browser preview: npm run preview
import { build } from "esbuild";
import less from "less";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("harness/dist", { recursive: true });
await build({
    entryPoints: ["harness/main.tsx"], bundle: true, outfile: "harness/dist/app.js",
    format: "iife", target: "es2020", jsx: "transform", minify: false, sourcemap: false,
    external: ["powerbi-visuals-api"], loader: { ".less": "empty" },
    define: { "process.env.NODE_ENV": "\"production\"" },
});
const css = await less.render(readFileSync("style/visual.less", "utf8"), { filename: "style/visual.less" });
writeFileSync("harness/dist/visual.css", css.css);
console.log("preview built -> harness/index.html (serve the harness folder, e.g. npx http-server harness)");
