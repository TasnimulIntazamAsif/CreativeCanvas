import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  FFMPEG_PATH,
  concatDemux,
  defaultName,
  materializeInput,
  normalizeClip,
  outputPath,
  outputUrlFor,
  probe,
  resolveFont,
  run,
  tempPath,
  TargetSpec,
} from "../ffmpeg.js";
import { A_CODEC, CHARACTER_LIMIT, DEFAULT_FPS, OUTPUT_DIR, V_CODEC } from "../constants.js";

// Shared result: a short human summary plus the output file's MediaInfo, and a
// download URL when the server is running with a public base URL (remote mode).
async function renderResult(out: string, signal?: AbortSignal) {
  const info = await probe(out, signal);
  const url = outputUrlFor(out);
  const mb = (info.size_bytes / (1024 * 1024)).toFixed(2);
  const dims = info.width ? `${info.width}x${info.height}` : "audio-only";
  const text =
    `Rendered: ${url ?? out}\n` +
    `- ${dims}${info.fps ? ` @ ${info.fps}fps` : ""}, ${info.duration_seconds.toFixed(2)}s, ${mb} MB\n` +
    `- video: ${info.video_codec ?? "none"}, audio: ${info.audio_codec ?? "none"}`;
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: { output_path: out, ...(url ? { output_url: url } : {}), ...info },
  };
}

const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const OutName = z
  .string()
  .min(1)
  .max(120)
  .optional()
  .describe("Output file name (no path, extension optional). Written into the render output directory.");

async function targetFromFirst(firstClip: string, signal?: AbortSignal): Promise<TargetSpec> {
  const info = await probe(firstClip, signal);
  return {
    width: info.width ?? 1920,
    height: info.height ?? 1080,
    fps: info.fps && info.fps > 0 ? Math.round(info.fps) : DEFAULT_FPS,
  };
}

export function registerRenderTools(server: McpServer): void {
  // -- probe ----------------------------------------------------------------
  server.registerTool(
    "render_probe_media",
    {
      title: "Probe media",
      description:
        "Inspect a video/audio/image file and return its duration, resolution, fps, codecs and whether it has audio. " +
        "Read-only. Use this first to learn a clip's exact size/length before trimming, resizing or composing.",
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the media file (absolute, or relative to the server's working dir)"),
      }),
      annotations: RO,
    },
    async ({ input }, ctx) => {
      const file = await materializeInput(input, ctx.mcpReq.signal);
      const info = await probe(file, ctx.mcpReq.signal);
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }], structuredContent: info };
    },
  );

  // -- trim -----------------------------------------------------------------
  server.registerTool(
    "render_trim_clip",
    {
      title: "Trim clip",
      description:
        "Cut a section out of a video and save it as a new MP4. Give a start time and either an end time or a duration. " +
        'Example: start_seconds=5, end_seconds=12 keeps seconds 5–12.',
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        start_seconds: z.number().min(0).default(0).describe("Where the cut starts, in seconds"),
        end_seconds: z.number().min(0).optional().describe("Where the cut ends, in seconds (omit to keep to the end)"),
        duration_seconds: z.number().min(0.05).optional().describe("Length to keep instead of end_seconds"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ input, start_seconds, end_seconds, duration_seconds, output_name }, ctx) => {
      const file = await materializeInput(input, ctx.mcpReq.signal);
      let dur = duration_seconds;
      if (end_seconds !== undefined) {
        if (end_seconds <= start_seconds) throw new Error("end_seconds must be greater than start_seconds.");
        dur = end_seconds - start_seconds;
      }
      const out = outputPath(output_name ?? defaultName("trim"), "mp4");
      const args = ["-y", "-nostdin", "-ss", String(start_seconds), "-i", file];
      if (dur !== undefined) args.push("-t", String(dur));
      args.push(...V_CODEC, ...A_CODEC, "-movflags", "+faststart", out);
      await run(FFMPEG_PATH, args, ctx.mcpReq.signal);
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- resize ---------------------------------------------------------------
  server.registerTool(
    "render_resize_video",
    {
      title: "Resize video",
      description:
        "Scale a video to a target resolution. mode 'fit' (default) letterboxes inside the frame, 'cover' fills and crops, " +
        "'stretch' ignores aspect ratio. Example: width=1080, height=1920, mode='cover' for a vertical reel.",
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        width: z.number().int().min(16).max(7680).describe("Target width in pixels"),
        height: z.number().int().min(16).max(7680).describe("Target height in pixels"),
        mode: z.enum(["fit", "cover", "stretch"]).default("fit").describe("How to fit the source into the target frame"),
        pad_color: z.string().default("black").describe("Letterbox color for 'fit' mode (name or #rrggbb)"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ input, width, height, mode, pad_color, output_name }, ctx) => {
      const file = await materializeInput(input, ctx.mcpReq.signal);
      let vf: string;
      if (mode === "cover") {
        vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
      } else if (mode === "stretch") {
        vf = `scale=${width}:${height},setsar=1`;
      } else {
        vf =
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${pad_color},setsar=1`;
      }
      const out = outputPath(output_name ?? defaultName("resize"), "mp4");
      await run(
        FFMPEG_PATH,
        ["-y", "-nostdin", "-i", file, "-vf", vf, ...V_CODEC, ...A_CODEC, "-movflags", "+faststart", out],
        ctx.mcpReq.signal,
      );
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- overlay text ---------------------------------------------------------
  server.registerTool(
    "render_overlay_text",
    {
      title: "Overlay text",
      description:
        "Burn a text caption/title onto a video using ffmpeg drawtext. Choose a preset position or exact x/y, and an " +
        "optional time window. Needs a font: set RENDER_FONT_FILE, or a common system font is used. " +
        'Example: text="Akij iBOS", position="bottom-center", font_size=64.',
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        text: z.string().min(1).max(500).describe("The text to draw"),
        position: z
          .enum([
            "top-left", "top-center", "top-right",
            "center",
            "bottom-left", "bottom-center", "bottom-right",
          ])
          .default("bottom-center")
          .describe("Preset placement (ignored when x and y are both given)"),
        x: z.number().int().optional().describe("Exact x in pixels from the left (overrides position)"),
        y: z.number().int().optional().describe("Exact y in pixels from the top (overrides position)"),
        font_size: z.number().int().min(8).max(400).default(48).describe("Font size in pixels"),
        color: z.string().default("white").describe("Text color (name or #rrggbb, optional @alpha e.g. white@0.9)"),
        box: z.boolean().default(true).describe("Draw a translucent background box behind the text"),
        box_color: z.string().default("black@0.5").describe("Box color with alpha, e.g. black@0.5"),
        start_seconds: z.number().min(0).optional().describe("Show the text from this time (omit for the whole clip)"),
        end_seconds: z.number().min(0).optional().describe("Hide the text after this time"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async (a, ctx) => {
      const file = await materializeInput(a.input, ctx.mcpReq.signal);
      // Single-quote values inside the filtergraph so colons/slashes/commas are
      // literal; the only char to escape inside ffmpeg single quotes is the
      // quote itself (-> '\'' ). `expansion=none` keeps the text literal, so no
      // further %/backslash escaping is needed (this ffmpeg build rejects
      // `textfile=`, so the caption is passed inline via `text=`).
      const q = (s: string) => s.replace(/'/g, "'\\''");
      const font2 = q(resolveFont().replace(/\\/g, "/"));
      const text2 = q(a.text);

      const px = 40;
      let xExpr = "(w-text_w)/2";
      let yExpr = "h-text_h-40";
      switch (a.position) {
        case "top-left": xExpr = String(px); yExpr = String(px); break;
        case "top-center": xExpr = "(w-text_w)/2"; yExpr = String(px); break;
        case "top-right": xExpr = `w-text_w-${px}`; yExpr = String(px); break;
        case "center": xExpr = "(w-text_w)/2"; yExpr = "(h-text_h)/2"; break;
        case "bottom-left": xExpr = String(px); yExpr = "h-text_h-40"; break;
        case "bottom-center": xExpr = "(w-text_w)/2"; yExpr = "h-text_h-40"; break;
        case "bottom-right": xExpr = `w-text_w-${px}`; yExpr = "h-text_h-40"; break;
      }
      if (a.x !== undefined && a.y !== undefined) { xExpr = String(a.x); yExpr = String(a.y); }

      const parts = [
        `fontfile='${font2}'`,
        `text='${text2}'`,
        `expansion=none`,
        `fontsize=${a.font_size}`,
        `fontcolor=${a.color}`,
        `x=${xExpr}`,
        `y=${yExpr}`,
      ];
      if (a.box) parts.push("box=1", `boxcolor=${a.box_color}`, "boxborderw=16");
      if (a.start_seconds !== undefined || a.end_seconds !== undefined) {
        const s = a.start_seconds ?? 0;
        const e = a.end_seconds ?? 1e9;
        parts.push(`enable='between(t,${s},${e})'`);
      }
      const vf = `drawtext=${parts.join(":")}`;
      const out = outputPath(a.output_name ?? defaultName("text"), "mp4");
      await run(
        FFMPEG_PATH,
        ["-y", "-nostdin", "-i", file, "-vf", vf, ...V_CODEC, ...A_CODEC, "-movflags", "+faststart", out],
        ctx.mcpReq.signal,
      );
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- extract audio --------------------------------------------------------
  server.registerTool(
    "render_extract_audio",
    {
      title: "Extract audio",
      description: "Pull the audio track out of a video into a standalone audio file (mp3/wav/aac/m4a).",
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        format: z.enum(["mp3", "wav", "aac", "m4a"]).default("mp3").describe("Output audio format"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ input, format, output_name }, ctx) => {
      const file = await materializeInput(input, ctx.mcpReq.signal);
      const info = await probe(file, ctx.mcpReq.signal);
      if (!info.has_audio) throw new Error("That file has no audio track to extract.");
      const out = outputPath(output_name ?? defaultName("audio"), format);
      const codec =
        format === "wav" ? ["-c:a", "pcm_s16le"]
        : format === "mp3" ? ["-c:a", "libmp3lame", "-q:a", "2"]
        : ["-c:a", "aac", "-b:a", "192k"];
      await run(FFMPEG_PATH, ["-y", "-nostdin", "-i", file, "-vn", "-map", "0:a:0", ...codec, out], ctx.mcpReq.signal);
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- set audio ------------------------------------------------------------
  server.registerTool(
    "render_set_audio",
    {
      title: "Set / replace audio",
      description:
        "Put an audio track onto a video. mode 'replace' (default) swaps in the new audio; 'mix' blends it with the " +
        "video's existing audio. loop=true repeats short audio to cover the video; otherwise output ends with the " +
        "shorter of the two. Example: add a music bed with volume=0.6, mode='mix'.",
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        audio: z.string().min(1).describe("Path to the audio file to add"),
        mode: z.enum(["replace", "mix"]).default("replace").describe("Replace the video's audio, or mix with it"),
        volume: z.number().min(0).max(4).default(1).describe("Gain applied to the new audio (1 = unchanged)"),
        loop: z.boolean().default(false).describe("Loop the audio to cover the whole video"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ input, audio, mode, volume, loop, output_name }, ctx) => {
      const vfile = await materializeInput(input, ctx.mcpReq.signal);
      const afile = await materializeInput(audio, ctx.mcpReq.signal);
      const vinfo = await probe(vfile, ctx.mcpReq.signal);
      const out = outputPath(output_name ?? defaultName("audio_set"), "mp4");
      // -stream_loop must come right before the input it loops (the audio).
      const args = ["-y", "-nostdin", "-i", vfile];
      if (loop) args.push("-stream_loop", "-1");
      args.push("-i", afile);

      if (mode === "mix" && vinfo.has_audio) {
        args.push(
          "-filter_complex",
          `[1:a]volume=${volume}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
          "-map", "0:v:0", "-map", "[aout]",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
          "-movflags", "+faststart", out,
        );
      } else {
        args.push(
          "-map", "0:v:0", "-map", "1:a:0",
          "-af", `volume=${volume}`,
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
          "-movflags", "+faststart", out,
        );
      }
      await run(FFMPEG_PATH, args, ctx.mcpReq.signal);
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- gif ------------------------------------------------------------------
  server.registerTool(
    "render_make_gif",
    {
      title: "Make GIF",
      description:
        "Turn a video (or a section of it) into an animated GIF with a good palette. Keep it short; GIFs get large fast. " +
        "Example: start_seconds=2, duration_seconds=4, fps=12, width=480.",
      inputSchema: z.strictObject({
        input: z.string().min(1).describe("Path to the source video"),
        start_seconds: z.number().min(0).default(0).describe("Where to start"),
        duration_seconds: z.number().min(0.1).max(60).default(4).describe("How many seconds to capture"),
        fps: z.number().int().min(1).max(30).default(12).describe("Frames per second"),
        width: z.number().int().min(16).max(1920).default(480).describe("Output width in pixels (height auto)"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ input, start_seconds, duration_seconds, fps, width, output_name }, ctx) => {
      const file = await materializeInput(input, ctx.mcpReq.signal);
      const out = outputPath(output_name ?? defaultName("gif"), "gif");
      const vf =
        `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
      await run(
        FFMPEG_PATH,
        ["-y", "-nostdin", "-ss", String(start_seconds), "-t", String(duration_seconds), "-i", file, "-vf", vf, "-loop", "0", out],
        ctx.mcpReq.signal,
      );
      const info = await probe(out, ctx.mcpReq.signal);
      const url = outputUrlFor(out);
      const mb = (info.size_bytes / (1024 * 1024)).toFixed(2);
      return {
        content: [{ type: "text", text: `Rendered GIF: ${url ?? out}\n- ${info.width}x${info.height} @ ${fps}fps, ${mb} MB` }],
        structuredContent: { output_path: out, ...(url ? { output_url: url } : {}), ...info },
      };
    },
  );

  // -- concat ---------------------------------------------------------------
  server.registerTool(
    "render_concat_clips",
    {
      title: "Concatenate clips",
      description:
        "Join several video clips end to end into one MP4. Clips are normalized to a common resolution/fps first, so " +
        "mixed sources join cleanly. By default the target matches the first clip; override width/height/fps if needed.",
      inputSchema: z.strictObject({
        inputs: z.array(z.string().min(1)).min(2).max(50).describe("Ordered list of video file paths to join"),
        width: z.number().int().min(16).max(7680).optional().describe("Target width (default: first clip's)"),
        height: z.number().int().min(16).max(7680).optional().describe("Target height (default: first clip's)"),
        fps: z.number().int().min(1).max(120).optional().describe("Target fps (default: first clip's)"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ inputs, width, height, fps, output_name }, ctx) => {
      const files = await Promise.all(inputs.map((f) => materializeInput(f, ctx.mcpReq.signal)));
      const base = await targetFromFirst(files[0], ctx.mcpReq.signal);
      const target: TargetSpec = {
        width: width ?? base.width,
        height: height ?? base.height,
        fps: fps ?? base.fps,
      };
      const parts: string[] = [];
      for (const f of files) {
        const tmp = tempPath("mp4");
        await normalizeClip(f, target, tmp, {}, ctx.mcpReq.signal);
        parts.push(tmp);
      }
      const out = outputPath(output_name ?? defaultName("concat"), "mp4");
      await concatDemux(parts, out, ctx.mcpReq.signal);
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- compose (workflow) ---------------------------------------------------
  server.registerTool(
    "render_compose",
    {
      title: "Compose video",
      description:
        "One-shot render: take an ordered list of clips (each optionally trimmed), normalize and join them to a " +
        "target resolution/fps, then optionally lay a background audio/music track over the result. This is the main " +
        "'make a video from these clips' tool. Example: clips=[{path:'a.mp4',start:0,end:5},{path:'b.mp4'}], " +
        "audio={path:'music.mp3',volume:0.5}.",
      inputSchema: z.strictObject({
        clips: z
          .array(
            z.strictObject({
              path: z.string().min(1).describe("Clip file path"),
              start: z.number().min(0).optional().describe("Trim start in seconds"),
              end: z.number().min(0).optional().describe("Trim end in seconds"),
            }),
          )
          .min(1)
          .max(50)
          .describe("Ordered clips to assemble"),
        width: z.number().int().min(16).max(7680).optional().describe("Target width (default: first clip's)"),
        height: z.number().int().min(16).max(7680).optional().describe("Target height (default: first clip's)"),
        fps: z.number().int().min(1).max(120).optional().describe("Target fps (default: first clip's)"),
        audio: z
          .strictObject({
            path: z.string().min(1).describe("Background audio/music file path"),
            volume: z.number().min(0).max(4).default(1).describe("Audio gain (1 = unchanged)"),
            mode: z.enum(["replace", "mix"]).default("replace").describe("Replace clip audio or mix over it"),
            loop: z.boolean().default(true).describe("Loop the audio to cover the whole video"),
          })
          .optional()
          .describe("Optional background audio laid over the assembled video"),
        output_name: OutName,
      }),
      annotations: RW,
    },
    async ({ clips, width, height, fps, audio, output_name }, ctx) => {
      // Download/resolve every clip once up front (URLs are fetched here).
      const localClips = await Promise.all(clips.map((c) => materializeInput(c.path, ctx.mcpReq.signal)));
      const base = await targetFromFirst(localClips[0], ctx.mcpReq.signal);
      const target: TargetSpec = {
        width: width ?? base.width,
        height: height ?? base.height,
        fps: fps ?? base.fps,
      };

      const parts: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const f = localClips[i];
        const tmp = tempPath("mp4");
        if (clip.end !== undefined && clip.start !== undefined && clip.end <= clip.start) {
          throw new Error(`Clip ${clip.path}: end must be greater than start.`);
        }
        await normalizeClip(f, target, tmp, { start: clip.start, end: clip.end }, ctx.mcpReq.signal);
        parts.push(tmp);
      }

      const joined = parts.length === 1 ? parts[0] : tempPath("mp4");
      if (parts.length > 1) await concatDemux(parts, joined, ctx.mcpReq.signal);

      const out = outputPath(output_name ?? defaultName("compose"), "mp4");
      if (!audio) {
        // Copy/remux the joined result to the output directory.
        await run(FFMPEG_PATH, ["-y", "-nostdin", "-i", joined, "-c", "copy", "-movflags", "+faststart", out], ctx.mcpReq.signal);
      } else {
        const afile = await materializeInput(audio.path, ctx.mcpReq.signal);
        // -stream_loop must come right before the input it loops (the audio).
        const args = ["-y", "-nostdin", "-i", joined];
        if (audio.loop) args.push("-stream_loop", "-1");
        args.push("-i", afile);
        if (audio.mode === "mix") {
          args.push(
            "-filter_complex",
            `[1:a]volume=${audio.volume}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            "-map", "0:v:0", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
          );
        } else {
          args.push(
            "-map", "0:v:0", "-map", "1:a:0", "-af", `volume=${audio.volume}`,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
          );
        }
        await run(FFMPEG_PATH, args, ctx.mcpReq.signal);
      }
      return renderResult(out, ctx.mcpReq.signal);
    },
  );

  // -- list outputs ---------------------------------------------------------
  server.registerTool(
    "render_list_outputs",
    {
      title: "List rendered files",
      description: "List the files already rendered into the output directory, newest first. Read-only.",
      inputSchema: z.strictObject({
        limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of files to list"),
      }),
      annotations: RO,
    },
    async ({ limit }) => {
      if (!fs.existsSync(OUTPUT_DIR)) {
        return { content: [{ type: "text", text: `No renders yet. Output directory: ${OUTPUT_DIR}` }] };
      }
      const entries = fs
        .readdirSync(OUTPUT_DIR)
        .map((name) => {
          const full = path.join(OUTPUT_DIR, name);
          const st = fs.statSync(full);
          return { name, path: full, size_bytes: st.size, modified: st.mtime.toISOString(), isFile: st.isFile() };
        })
        .filter((e) => e.isFile)
        .sort((a, b) => b.modified.localeCompare(a.modified))
        .slice(0, limit)
        .map(({ isFile, ...rest }) => rest);

      const lines = [`Output directory: ${OUTPUT_DIR}`, `${entries.length} file(s):`, ""];
      for (const e of entries) lines.push(`- ${e.name}  (${(e.size_bytes / (1024 * 1024)).toFixed(2)} MB, ${e.modified})`);
      let text = lines.join("\n");
      if (text.length > CHARACTER_LIMIT) text = text.slice(0, CHARACTER_LIMIT);
      return { content: [{ type: "text", text }], structuredContent: { output_dir: OUTPUT_DIR, files: entries } };
    },
  );
}
