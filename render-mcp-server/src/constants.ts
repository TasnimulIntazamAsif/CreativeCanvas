import os from "node:os";
import path from "node:path";

// Where finished renders are written. Override with RENDER_OUTPUT_DIR.
export const OUTPUT_DIR =
  process.env.RENDER_OUTPUT_DIR ||
  path.join(os.homedir(), "CreativeCanvasRenders");

// Font used by the text-overlay tool (drawtext). Override with RENDER_FONT_FILE.
// Falls back to a common Windows/Linux/macOS system font at call time.
export const FONT_FILE_ENV = process.env.RENDER_FONT_FILE;

export const FONT_FALLBACKS = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/Library/Fonts/Arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
];

// Default encode settings, kept consistent so clips concatenate cleanly.
export const DEFAULT_FPS = 30;
export const V_CODEC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"];
export const A_CODEC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

// list_outputs text cap.
export const CHARACTER_LIMIT = 25_000;

// ---- remote (Streamable HTTP) mode ----------------------------------------

// "http" serves Streamable HTTP on PORT; anything else serves stdio.
export const TRANSPORT = process.env.TRANSPORT ?? "stdio";
export const PORT = Number(process.env.PORT ?? 3000);

// Public base URL the server is reachable at (e.g. https://render-mcp.example.com).
// When set, render results include a downloadable output_url under /files/.
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

// Static bearer token required on the HTTP endpoint. When unset, the HTTP
// endpoint runs unauthenticated (fine only for localhost / trusted networks).
export const MCP_TOKEN = process.env.MCP_TOKEN ?? "";

// Cap on how large a downloaded input URL may be (bytes).
export const MAX_DOWNLOAD_BYTES = Number(process.env.MAX_DOWNLOAD_BYTES ?? 500 * 1024 * 1024);
