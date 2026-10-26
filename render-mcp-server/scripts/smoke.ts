/**
 * Self-check: generates tiny test clips with the bundled ffmpeg, starts the
 * built server over stdio, calls its render tools as a client would, and exits
 * non-zero on any failure.
 *
 * Run with: npm run build && npm run smoke
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static") as string;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "ccrender-smoke-"));
const outDir = path.join(work, "out");
fs.mkdirSync(outDir, { recursive: true });

const clipA = path.join(work, "clipA.mp4"); // has audio
const clipB = path.join(work, "clipB.mp4"); // no audio
const music = path.join(work, "music.m4a");

function ff(args: string[]): void {
  execFileSync(FFMPEG, args, { stdio: "ignore" });
}

console.error("Generating test media...");
ff(["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clipA]);
ff(["-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=15:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", clipB]);
ff(["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=6", "-c:a", "aac", music]);

const client = new Client({ name: "render-smoke", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...getDefaultEnvironment(), RENDER_OUTPUT_DIR: outDir },
  }),
);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.error("Tools:", names.join(", "));
assert.ok(names.includes("render_compose"), "render_compose should be registered");
assert.ok(names.includes("render_probe_media"), "render_probe_media should be registered");
assert.equal(names.length, 10, `expected 10 tools, got ${names.length}`);

// probe
const probed = await client.callTool({ name: "render_probe_media", arguments: { input: clipA } });
assert.ok(!probed.isError, `probe failed: ${JSON.stringify(probed.content)}`);
const info = probed.structuredContent as { has_video: boolean; has_audio: boolean };
assert.ok(info.has_video && info.has_audio, "clipA should have video and audio");

// trim
const trimmed = await client.callTool({
  name: "render_trim_clip",
  arguments: { input: clipA, start_seconds: 0, duration_seconds: 1, output_name: "smoke_trim" },
});
assert.ok(!trimmed.isError, `trim failed: ${JSON.stringify(trimmed.content)}`);
const trimOut = (trimmed.structuredContent as { output_path: string }).output_path;
assert.ok(fs.existsSync(trimOut), "trim output file should exist");

// overlay text (font may be absent on headless CI; tolerate only that)
const texted = await client.callTool({
  name: "render_overlay_text",
  arguments: { input: clipA, text: "Akij iBOS", position: "bottom-center", font_size: 32, output_name: "smoke_text" },
});
if (texted.isError) {
  const msg = JSON.stringify(texted.content);
  assert.ok(/font/i.test(msg), `overlay failed for a non-font reason: ${msg}`);
  console.error("overlay_text skipped (no system font available)");
} else {
  assert.ok(fs.existsSync((texted.structuredContent as { output_path: string }).output_path), "text output should exist");
}

// compose: clipA (with audio) + clipB (no audio), trimmed, with background music
const composed = await client.callTool({
  name: "render_compose",
  arguments: {
    clips: [{ path: clipA, start: 0, end: 2 }, { path: clipB }],
    width: 320,
    height: 240,
    fps: 15,
    audio: { path: music, volume: 0.5, mode: "replace", loop: true },
    output_name: "smoke_compose",
  },
});
assert.ok(!composed.isError, `compose failed: ${JSON.stringify(composed.content)}`);
const composeOut = (composed.structuredContent as { output_path: string; has_audio: boolean }).output_path;
assert.ok(fs.existsSync(composeOut), "compose output should exist");

// gif
const gif = await client.callTool({
  name: "render_make_gif",
  arguments: { input: clipA, start_seconds: 0, duration_seconds: 1, fps: 8, width: 160, output_name: "smoke_gif" },
});
assert.ok(!gif.isError, `gif failed: ${JSON.stringify(gif.content)}`);
assert.ok(fs.existsSync((gif.structuredContent as { output_path: string }).output_path), "gif output should exist");

// invalid args -> tool error the model can read
const bad = await client.callTool({
  name: "render_trim_clip",
  arguments: { input: clipA, start_seconds: 5, end_seconds: 2 },
});
assert.equal(bad.isError, true, "end before start should be rejected");

await client.close();
console.error("Smoke test passed. Outputs in:", outDir);
