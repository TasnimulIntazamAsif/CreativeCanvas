import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  OUTPUT_DIR,
  FONT_FILE_ENV,
  FONT_FALLBACKS,
  PUBLIC_BASE_URL,
  MAX_DOWNLOAD_BYTES,
} from "./constants.js";

// ffmpeg-static / ffprobe-static are CJS packages that export binary paths.
// createRequire avoids ESM/CJS interop and typing friction.
const require = createRequire(import.meta.url);
export const FFMPEG_PATH = require("ffmpeg-static") as string;
export const FFPROBE_PATH = (require("ffprobe-static") as { path: string }).path;

if (!FFMPEG_PATH || !fs.existsSync(FFMPEG_PATH)) {
  console.error(
    "Bundled ffmpeg binary not found. Reinstall dependencies: `npm install` then " +
      "`node node_modules/ffmpeg-static/install.js`.",
  );
}

// ---- process runner -------------------------------------------------------

export interface RunResult {
  stdout: string;
  stderr: string;
}

// Runs a bundled binary with explicit args (no shell, so paths/text are safe).
// Rejects with the tail of ffmpeg's stderr, which is where the real cause is.
export function run(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 1024 * 1024 * 64, signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).name === "AbortError") {
            reject(new Error("The render was cancelled."));
            return;
          }
          const tail = String(stderr).trim().split("\n").slice(-6).join("\n");
          reject(new Error(`ffmpeg failed:\n${tail || error.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

// ---- probing --------------------------------------------------------------

export interface MediaInfo {
  path: string;
  format: string;
  duration_seconds: number;
  size_bytes: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_video: boolean;
  has_audio: boolean;
  video_codec: string | null;
  audio_codec: string | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
}

interface FfprobeJson {
  format?: { format_name?: string; duration?: string; size?: string };
  streams?: FfprobeStream[];
}

function parseFps(r?: string): number | null {
  if (!r) return null;
  const [num, den] = r.split("/").map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 1000) / 1000;
}

export async function probe(input: string, signal?: AbortSignal): Promise<MediaInfo> {
  const file = resolveInput(input);
  const { stdout } = await run(
    FFPROBE_PATH,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    signal,
  );
  const data = JSON.parse(stdout) as FfprobeJson;
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  return {
    path: file,
    format: data.format?.format_name ?? "unknown",
    duration_seconds: Number(data.format?.duration ?? 0),
    size_bytes: Number(data.format?.size ?? 0),
    width: v?.width ?? null,
    height: v?.height ?? null,
    fps: parseFps(v?.r_frame_rate),
    has_video: Boolean(v),
    has_audio: Boolean(a),
    video_codec: v?.codec_name ?? null,
    audio_codec: a?.codec_name ?? null,
  };
}

// ---- paths ----------------------------------------------------------------

export function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Resolves an input path (absolute, or relative to cwd) and checks it exists.
export function resolveInput(p: string): string {
  const resolved = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Input file not found: ${resolved}. Pass an http(s) URL, an absolute path, or a path relative to ${process.cwd()}.`,
    );
  }
  return resolved;
}

function extFromUrl(u: string): string {
  try {
    const name = new URL(u).pathname.split("/").pop() ?? "";
    const m = name.match(/\.([a-zA-Z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : "media";
  } catch {
    return "media";
  }
}

// Downloads an http(s) URL to a temp file (size-capped) and returns its path.
export async function downloadToTemp(url: string, signal?: AbortSignal): Promise<string> {
  const out = tempPath(extFromUrl(url));
  let res: Response;
  try {
    res = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new Error(`Could not download ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > MAX_DOWNLOAD_BYTES) {
    throw new Error(`${url} is ${(len / 1048576).toFixed(0)} MB, over the ${(MAX_DOWNLOAD_BYTES / 1048576).toFixed(0)} MB limit.`);
  }
  if (!res.body) throw new Error(`Could not download ${url}: empty response body.`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(out));
  return out;
}

// Turns an input reference into a local file path: downloads http(s) URLs,
// otherwise resolves a local path. Use this (await) in every tool.
export async function materializeInput(input: string, signal?: AbortSignal): Promise<string> {
  if (/^https?:\/\//i.test(input)) return downloadToTemp(input, signal);
  return resolveInput(input);
}

// A public download URL for a rendered file, when PUBLIC_BASE_URL is configured.
export function outputUrlFor(outPath: string): string | undefined {
  if (!PUBLIC_BASE_URL) return undefined;
  return `${PUBLIC_BASE_URL}/files/${encodeURIComponent(path.basename(outPath))}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "render";
}

// Builds an output path in OUTPUT_DIR. `name` may omit the extension.
export function outputPath(name: string, ext: string): string {
  ensureOutputDir();
  const base = sanitizeName(name.replace(/\.[^.]+$/, ""));
  return path.join(OUTPUT_DIR, `${base}.${ext.replace(/^\./, "")}`);
}

export function defaultName(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}_${stamp}`;
}

// A temp working file inside the OS temp dir.
export function tempPath(ext: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccrender-"));
  return path.join(dir, `clip.${ext.replace(/^\./, "")}`);
}

// ---- drawtext helpers -----------------------------------------------------

// Resolves a usable font file for drawtext, or throws an actionable error.
export function resolveFont(): string {
  const candidates = [FONT_FILE_ENV, ...FONT_FALLBACKS].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "No usable font file was found for text overlay. Set RENDER_FONT_FILE to a .ttf/.otf path " +
      "(e.g. C:/Windows/Fonts/arial.ttf).",
  );
}

// Escapes a filesystem path for use inside an ffmpeg filtergraph option
// (forward slashes, and the Windows drive colon escaped).
export function escFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// ---- normalize for concat -------------------------------------------------

export interface TargetSpec {
  width: number;
  height: number;
  fps: number;
}

// Scale+pad a clip to exactly width×height at fps, re-encode to a uniform
// codec, and guarantee a stereo audio track (silent if the source has none),
// so normalized clips can be concatenated by the concat demuxer with -c copy.
export async function normalizeClip(
  input: string,
  target: TargetSpec,
  out: string,
  opts: { start?: number; end?: number } = {},
  signal?: AbortSignal,
): Promise<void> {
  const info = await probe(input, signal);
  const { width: W, height: H, fps } = target;
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`;

  // Always bound the output duration. This trims when requested and, crucially,
  // caps the infinite silent-audio source below so the mux can't hang.
  const start = opts.start ?? 0;
  const end = opts.end ?? info.duration_seconds;
  const dur = Math.max(0.05, end - start);

  const args: string[] = ["-y", "-nostdin"];
  if (start > 0) args.push("-ss", String(start));
  args.push("-i", input);

  if (!info.has_audio) {
    // Add a silent stereo track; -t below caps its length to the video.
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  args.push("-t", String(dur));

  args.push("-vf", vf);
  args.push("-map", "0:v:0");
  args.push("-map", info.has_audio ? "0:a:0?" : "1:a:0");
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-shortest",
    out,
  );
  await run(FFMPEG_PATH, args, signal);
}

// Concatenate already-normalized clips with the concat demuxer (stream copy).
export async function concatDemux(parts: string[], out: string, signal?: AbortSignal): Promise<void> {
  const listFile = tempPath("txt");
  const body = parts.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listFile, body, "utf8");
  await run(
    FFMPEG_PATH,
    ["-y", "-nostdin", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out],
    signal,
  );
}
