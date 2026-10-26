/**
 * One-off demo: connect to the local built server over stdio and call
 * render_overlay_text, exactly as a host (Claude) would. Prints the output path.
 *
 * Usage: INPUT=<path-or-url> OUT_DIR=<dir> tsx scripts/demo-overlay.ts
 */
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const input = process.env.INPUT!;
const outDir = process.env.OUT_DIR!;

const client = new Client({ name: "demo", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...getDefaultEnvironment(), RENDER_OUTPUT_DIR: outDir },
  }),
);

const res = await client.callTool({
  name: "render_overlay_text",
  arguments: {
    input,
    text: "Akij iBOS",
    position: "bottom-center",
    font_size: 48,
    output_name: "akij_ibos_demo",
  },
});

if (res.isError) {
  console.error("RENDER_ERROR", JSON.stringify(res.content));
  process.exit(1);
}
const sc = res.structuredContent as { output_path: string; duration_seconds: number; width: number; height: number };
console.log("OUTPUT_PATH=" + sc.output_path);
console.log(`INFO=${sc.width}x${sc.height}, ${sc.duration_seconds}s`);
await client.close();
