import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { resolve } from "node:path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// NB(bt): This configuration file can specify bundler rollup options, compiler plugins,
// import path resolution, dev server HTTP headers, CORS options, path rewriting, etc.
// Read the vite docs for more: https://vitejs.dev/config/

const SPARK_MODULE_SUBPATH = "/@sparkjsdev/spark/dist/spark.module.js";
const SPARK_WASM_PATTERN =
  /module_or_path = new URL\("(data:application\/wasm;base64,[^"]+)", import\.meta\.url\);/;

const sparkWasmDataUrlFix = (): Plugin => ({
  name: "spark-wasm-data-url-fix",
  enforce: "pre",
  apply: "serve",
  transform(code, id) {
    if (!id.includes(SPARK_MODULE_SUBPATH)) {
      return null;
    }

    const match = code.match(SPARK_WASM_PATTERN);
    if (!match) {
      return null;
    }

    const [, dataUrl] = match;
    const patched = code.replace(
      SPARK_WASM_PATTERN,
      `module_or_path = "${dataUrl}";`,
    );

    return {
      code: patched,
      map: null,
    };
  },
});

// Dev-only proxy for the video editor's AI command bar when it runs in a
// plain browser tab (the desktop app calls these providers from Rust).
// `/__llm/<provider>/chat/completions` -> the provider's OpenAI-compatible API.
const LLM_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com",
};

const llmDevProxy = Object.fromEntries(
  Object.entries(LLM_PROVIDER_BASE_URLS).map(([provider, baseUrl]) => {
    const target = new URL(baseUrl);
    return [
      `/__llm/${provider}`,
      {
        target: target.origin,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(`/__llm/${provider}`, target.pathname.replace(/\/$/, "")),
      },
    ];
  }),
);

const projectRoot = __dirname;
const appRoot = path.resolve(projectRoot, "app");
const workspaceRoot = path.resolve(projectRoot, "..", "..");

export default defineConfig({
  root: appRoot,
  optimizeDeps: {
    exclude: ["@sparkjsdev/spark"],
  },
  build: {
    outDir: path.resolve(projectRoot, "dist"),
    rollupOptions: {
      input: {
        index: resolve(projectRoot, "app/index.html"),
      },
    },
  },
  plugins: [
    react(),
    sparkWasmDataUrlFix(),
    tsconfigPaths({
      // Resolve workspace packages to source for every importer, including shared
      // libraries. Fresh release checkouts have no prebuilt library dist files.
      projects: [path.resolve(workspaceRoot, "tsconfig.base.json")],
    }),
    wasm(),
    topLevelAwait(),
  ],
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    proxy: llmDevProxy,
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@preact/signals-core",
      "@preact/signals-react"
    ],
  },
});
