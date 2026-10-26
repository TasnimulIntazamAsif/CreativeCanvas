/**
 * HTTP self-check: expects the server running in http mode on PORT (default 5056)
 * with PUBLIC_BASE_URL matching. Generates a clip, trims it over HTTP, then feeds
 * the returned output_url back in as a URL input to prove URL I/O works.
 *
 * Start the server first, e.g.:
 *   TRANSPORT=http PORT=5056 PUBLIC_BASE_URL=http://localhost:5056 \
 *   RENDER_OUTPUT_DIR=<tmp> node dist/index.js
 * then: tsx scripts/smoke-http.ts
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static") as string;
const PORT = process.env.PORT ?? "5056";
const URL_BASE = `http://localhost:${PORT}`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "ccrender-http-"));
const clipA = path.join(work, "clipA.mp4");
execFileSync(
  FFMPEG,
  ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=3",
   "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
   "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clipA],
  { stdio: "ignore" },
);

// health check
const health = await fetch(`${URL_BASE}/healthz`).then((r) => r.json() as Promise<{ ok: boolean }>);
assert.ok(health.ok, "healthz should report ok");

const client = new Client({ name: "render-http-smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${URL_BASE}/mcp`)));

const { tools } = await client.listTools();
assert.equal(tools.length, 10, `expected 10 tools, got ${tools.length}`);
console.error("Connected over HTTP. Tools:", tools.length);

// trim a local path; expect an output_url because PUBLIC_BASE_URL is set
const trimmed = await client.callTool({
  name: "render_trim_clip",
  arguments: { input: clipA, start_seconds: 0, duration_seconds: 1, output_name: "http_trim" },
});
assert.ok(!trimmed.isError, `trim failed: ${JSON.stringify(trimmed.content)}`);
const sc = trimmed.structuredContent as { output_url?: string };
assert.ok(sc.output_url?.startsWith(URL_BASE + "/files/"), `expected output_url under /files, got ${sc.output_url}`);
console.error("Output URL:", sc.output_url);

// the output_url should be downloadable
const dl = await fetch(sc.output_url!);
assert.ok(dl.ok, `output_url not downloadable: HTTP ${dl.status}`);

// feed the output_url back in as a URL INPUT (download round-trip)
const reprobe = await client.callTool({ name: "render_probe_media", arguments: { input: sc.output_url } });
assert.ok(!reprobe.isError, `probe-by-url failed: ${JSON.stringify(reprobe.content)}`);
const info = reprobe.structuredContent as { has_video: boolean; duration_seconds: number };
assert.ok(info.has_video, "probed URL input should have video");

await client.close();
console.error("HTTP smoke test passed.");
