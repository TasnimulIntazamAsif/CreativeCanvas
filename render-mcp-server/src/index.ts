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
