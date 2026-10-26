# creativecanvas-render-mcp-server

An **MCP server that renders video** for the CreativeCanvas project. Connect it
to Claude (Claude Code or Claude Desktop) and ask Claude to trim, caption,
resize, concatenate and compose videos — Claude calls these tools to do the
actual rendering.

**ffmpeg is bundled.** The server ships its own `ffmpeg`/`ffprobe` via the
`ffmpeg-static` and `ffprobe-static` npm packages, so you do **not** need ffmpeg
installed on your system.

## Tools

| Tool | What it does |
|------------------------|------------------------------------------------------------------|
| `render_probe_media`   | Inspect a file: duration, resolution, fps, codecs, has-audio.    |
| `render_trim_clip`     | Cut a section of a video (start + end/duration) to a new MP4.    |
| `render_resize_video`  | Scale to a target size — `fit` (letterbox), `cover`, `stretch`.  |
| `render_overlay_text`  | Burn a title/caption onto a video (position, size, color, time). |
| `render_extract_audio` | Pull the audio out of a video to mp3/wav/aac/m4a.                |
| `render_set_audio`     | Replace or mix an audio/music track onto a video.                |
| `render_make_gif`      | Turn a clip (or a section) into an animated GIF.                 |
| `render_concat_clips`  | Join several clips end to end (auto-normalized to one format).   |
| `render_compose`       | One-shot: ordered clips (each trimmable) + optional music → MP4. |
| `render_list_outputs`  | List the files already rendered.                                |

Rendered files are written to the **output directory** (default:
`~/CreativeCanvasRenders`; override with `RENDER_OUTPUT_DIR`). Each tool returns
the output file path and its probed metadata.

## Setup

From this folder:

```bash
npm install
npm run build
```

`npm install` downloads the bundled ffmpeg binary. If your npm enforces
install-script approval (you'll see an `allow-scripts` warning), finish the
download with:

```bash
node node_modules/ffmpeg-static/install.js
```

Verify everything works end to end (generates test clips and renders with every tool):

```bash
npm run smoke
```

## Live remote endpoint (Openship)

A hosted instance runs on Openship (server ibos-34), always-on:

- MCP endpoint: **`https://render-mcp.ibos.agency/mcp`** (Streamable HTTP)
- Health: `https://render-mcp.ibos.agency/healthz`
- Rendered files: `https://render-mcp.ibos.agency/files/<name>`
- Auth: bearer token in the `Authorization` header.

On the remote endpoint, pass **input files as http(s) URLs**; each result's
`output_url` is a downloadable link under `/files/`.

**Connect Claude Code to the live endpoint:**

```bash
claude mcp add --transport http creativecanvas-render https://render-mcp.ibos.agency/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

Rebuild/redeploy the remote instance by re-uploading this folder (Dockerfile
build) to the Openship project `creativecanvas-render-mcp`.

## Connect to Claude (local)

The server also speaks MCP over **stdio**; a host launches it as `node dist/index.js`.

### Claude Code (this repo)

A project `.mcp.json` is already included at the repo root, so a Claude Code
session opened in this project offers the server automatically (approve it when
prompted). To register it yourself, or for another project:

```bash
claude mcp add creativecanvas-render --scope user -- node "D:/GitHUb projects/CreativeCanvas/render-mcp-server/dist/index.js"
```

Add an output directory with `--env`:

```bash
claude mcp add creativecanvas-render --scope user --env RENDER_OUTPUT_DIR=D:/renders -- node "D:/GitHUb projects/CreativeCanvas/render-mcp-server/dist/index.js"
```

### Claude Desktop

Edit `claude_desktop_config.json`
(Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "creativecanvas-render": {
      "command": "node",
      "args": ["D:/GitHUb projects/CreativeCanvas/render-mcp-server/dist/index.js"],
      "env": {
        "RENDER_OUTPUT_DIR": "D:/renders"
      }
    }
  }
}
```

Restart Claude Desktop. The render tools then appear in the tools list.

## Configuration (environment variables)

| Variable            | Default                      | Purpose                                   |
|---------------------|------------------------------|-------------------------------------------|
| `RENDER_OUTPUT_DIR` | `~/CreativeCanvasRenders`    | Where finished renders are written.       |
| `RENDER_FONT_FILE`  | first available system font  | Font (.ttf/.otf) used by `render_overlay_text`. |

## Example asks (once connected)

- "Probe `C:/videos/intro.mp4` and tell me its length and resolution."
- "Trim `intro.mp4` to seconds 5–12."
- "Put the caption 'Akij iBOS' at the bottom-center of `intro.mp4`, size 64."
- "Make a vertical 1080×1920 version of `intro.mp4` (cover)."
- "Compose a video from `a.mp4` (first 5s) then `b.mp4`, with `music.mp3` at 50% volume."

## Notes

- Input paths may be absolute or relative to the server's working directory.
- The server is read/write on the local filesystem only; it makes no network calls.
- Built with the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`), stdio transport.
