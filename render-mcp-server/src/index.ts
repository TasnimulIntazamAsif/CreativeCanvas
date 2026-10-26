#!/usr/bin/env node
/**
 * creativecanvas-render-mcp-server
 *
 * An MCP server that renders video with a bundled ffmpeg: probe, trim, resize,
 * overlay text, extract/replace audio, make GIFs, concatenate and compose.
 *
 * Two transports, chosen by the TRANSPORT env var:
 *   - stdio (default): a host (Claude Desktop / Claude Code) launches it as a
 *     subprocess and tools operate on local file paths.
 *   - http  (TRANSPORT=http): a remote Streamable HTTP endpoint at /mcp with an
 *     optional bearer token (MCP_TOKEN). Tools accept http(s) URLs as inputs and
 *     return a public output_url under /files (set PUBLIC_BASE_URL).
 *
 * No system ffmpeg is required — the binaries ship with the package.
 */
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRenderTools } from "./tools/render.js";
import { ensureOutputDir } from "./ffmpeg.js";
import { MCP_TOKEN, OUTPUT_DIR, PORT, PUBLIC_BASE_URL, TRANSPORT } from "./constants.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "creativecanvas-render-mcp-server", version: "1.0.0" });
  registerRenderTools(server);
  return server;
}

ensureOutputDir();

if (TRANSPORT === "http") {
  const handler = createMcpHandler(createServer);
  const nodeHandler = toNodeHandler(handler);
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "creativecanvas-render-mcp-server" });
  });

  // Friendly landing page listing the endpoints (this is an MCP API, not a site).
  app.get("/", (_req: Request, res: Response) => {
    res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CreativeCanvas Render MCP</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0e0f12; color:#e8e8ea; font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:680px; margin:0 auto; padding:48px 20px; }
  h1 { font-size:1.6rem; margin:0 0 4px; }
  .sub { color:#9aa0aa; margin:0 0 28px; }
  .card { border:1px solid #23252b; border-radius:12px; padding:18px 20px; margin:14px 0; background:#15171c; }
  code { background:#23252b; padding:2px 6px; border-radius:6px; font-size:.9em; }
  .ep { display:flex; gap:12px; padding:8px 0; border-bottom:1px solid #1d1f25; }
  .ep:last-child { border-bottom:0; }
  .ep b { color:#b79cff; min-width:92px; }
  .muted { color:#9aa0aa; }
  a { color:#b79cff; }
</style></head>
<body><div class="wrap">
  <h1>CreativeCanvas Render MCP</h1>
  <p class="sub">A video-rendering MCP server (bundled ffmpeg) — for connecting with Claude, not a website.</p>
  <div class="card">
    <div class="ep"><b>POST /mcp</b><span>MCP endpoint (Streamable HTTP). Requires <code>Authorization: Bearer &lt;token&gt;</code>.</span></div>
    <div class="ep"><b>GET /healthz</b><span>Health check.</span></div>
    <div class="ep"><b>GET /files/&hellip;</b><span>Download rendered output files.</span></div>
  </div>
  <div class="card">
    <p style="margin:0 0 8px"><b>Connect Claude Code:</b></p>
    <code>claude mcp add --transport http creativecanvas-render ${PUBLIC_BASE_URL || ""}/mcp --header "Authorization: Bearer &lt;token&gt;"</code>
  </div>
  <p class="muted">Tools: probe, trim, resize, overlay text, extract/set audio, GIF, concat, compose. Pass input files as http(s) URLs; results return a downloadable output_url.</p>
</div></body></html>`);
  });

  // Serve finished renders so clients can download output_url links.
  app.use("/files", express.static(OUTPUT_DIR, { index: false, fallthrough: false }));

  // Bearer auth (when MCP_TOKEN is set) in front of the MCP endpoint.
  const auth = (req: Request, res: Response, next: NextFunction): void => {
    if (MCP_TOKEN && req.headers.authorization !== `Bearer ${MCP_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.all("/mcp", auth, (req: Request, res: Response) => void nodeHandler(req, res, req.body));

  app.listen(PORT, "0.0.0.0", () => {
    console.error(
      `creativecanvas-render-mcp-server (http) on :${PORT}  mcp=/mcp  files=/files  ` +
        `auth=${MCP_TOKEN ? "on" : "off"}  base=${PUBLIC_BASE_URL || "(unset)"}`,
    );
  });
} else {
  serveStdio(createServer);
  console.error(`creativecanvas-render-mcp-server running on stdio (output dir: ${OUTPUT_DIR})`);
}
