import type { EffectPass, EffectUniformValue } from "./types";

// Effect passes that run in JavaScript on a 2D canvas instead of in the
// opencut-wasm GPU pipeline (which only ships the Gaussian blur shader).
// A pass whose shader name starts with `canvas2d:` is handled here; every
// other pass is still sent to the GPU.

export const CANVAS_PASS_PREFIX = "canvas2d:";

export const CSS_FILTER_SHADER = `${CANVAS_PASS_PREFIX}css-filter`;
export const VIGNETTE_SHADER = `${CANVAS_PASS_PREFIX}vignette`;
export const PIXELATE_SHADER = `${CANVAS_PASS_PREFIX}pixelate`;
export const GRAIN_SHADER = `${CANVAS_PASS_PREFIX}grain`;
export const TINT_SHADER = `${CANVAS_PASS_PREFIX}tint`;

/** Reference height that size-like params (pixel blocks) are tuned for. */
const REFERENCE_HEIGHT = 1080;

/** Strength of the tint's hue ("color") blend relative to its soft-light pass. */
const TINT_COLOR_BLEND_RATIO = 0.4;

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function isCanvasPass(pass: EffectPass): boolean {
  return pass.shader.startsWith(CANVAS_PASS_PREFIX);
}

/**
 * Draws `source` into `target` with every canvas pass applied in order.
 * `target` is cleared first and must already be `width` x `height`.
 */
export function runCanvasPasses({
  target,
  source,
  width,
  height,
  passes,
}: {
  target: Canvas2D;
  source: CanvasImageSource;
  width: number;
  height: number;
  passes: EffectPass[];
}): void {
  target.save();
  target.clearRect(0, 0, width, height);
  if (passes.length === 0) {
    target.drawImage(source, 0, 0, width, height);
    target.restore();
    return;
  }

  // Ping-pong through a scratch canvas so each pass reads the previous result.
  const scratch = getScratchContext({ width, height });
  scratch.clearRect(0, 0, width, height);
  scratch.drawImage(source, 0, 0, width, height);

  passes.forEach((pass, index) => {
    const isLast = index === passes.length - 1;
    const out: Canvas2D = isLast ? target : getScratchContext({ width, height, slot: 1 });
    out.save();
    out.clearRect(0, 0, width, height);
    applyPass({ pass, input: scratch.canvas, out, width, height });
    out.restore();
    if (!isLast) {
      scratch.clearRect(0, 0, width, height);
      scratch.drawImage(out.canvas, 0, 0);
    }
  });
  target.restore();
}

function applyPass({
  pass,
  input,
  out,
  width,
  height,
}: {
  pass: EffectPass;
  input: CanvasImageSource;
  out: Canvas2D;
  width: number;
  height: number;
}) {
  const u = pass.uniforms;
  switch (pass.shader) {
    case CSS_FILTER_SHADER:
      out.filter = buildCssFilter(u);
      out.drawImage(input, 0, 0, width, height);
      out.filter = "none";
      return;
    case VIGNETTE_SHADER:
      drawVignette({ input, out, width, height, intensity: num(u.intensity), size: num(u.size) });
      return;
    case PIXELATE_SHADER:
      drawPixelated({ input, out, width, height, blockSize: num(u.blockSize) });
      return;
    case GRAIN_SHADER:
      drawGrain({ input, out, width, height, amount: num(u.amount) });
      return;
    case TINT_SHADER:
      drawTint({ input, out, width, height, color: u.color, amount: num(u.amount) });
      return;
    default:
      out.drawImage(input, 0, 0, width, height);
  }
}

// Uniforms map 1:1 onto CSS filter functions; neutral values are skipped.
function buildCssFilter(u: Record<string, EffectUniformValue>): string {
  const parts: string[] = [];
  const add = (name: string, value: EffectUniformValue | undefined, neutral: number, unit: string) => {
    if (value === undefined) return;
    const n = num(value);
    if (Math.abs(n - neutral) > 1e-4) parts.push(`${name}(${n}${unit})`);
  };
  add("brightness", u.brightness, 1, "");
  add("contrast", u.contrast, 1, "");
  add("saturate", u.saturate, 1, "");
  add("grayscale", u.grayscale, 0, "");
  add("sepia", u.sepia, 0, "");
  add("invert", u.invert, 0, "");
  add("hue-rotate", u.hueRotate, 0, "deg");
  return parts.length > 0 ? parts.join(" ") : "none";
}

function drawVignette({
  input,
  out,
  width,
  height,
  intensity,
  size,
}: {
  input: CanvasImageSource;
  out: Canvas2D;
  width: number;
  height: number;
  intensity: number;
  size: number;
}) {
  out.drawImage(input, 0, 0, width, height);
  if (intensity <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.hypot(cx, cy);
  const inner = outer * Math.min(0.95, Math.max(0, size));
  const gradient = out.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${Math.min(1, intensity)})`);
  // source-atop keeps transparent areas (e.g. around text) untouched.
  out.globalCompositeOperation = "source-atop";
  out.fillStyle = gradient;
  out.fillRect(0, 0, width, height);
  out.globalCompositeOperation = "source-over";
}

// Color grade: soft-light a solid color over the image, then restore the
// source alpha so transparent areas stay transparent.
function drawTint({
  input,
  out,
  width,
  height,
  color,
  amount,
}: {
  input: CanvasImageSource;
  out: Canvas2D;
  width: number;
  height: number;
  color: EffectUniformValue | undefined;
  amount: number;
}) {
  out.drawImage(input, 0, 0, width, height);
  if (amount <= 0 || !Array.isArray(color)) return;
  const [r = 0, g = 0, b = 0] = color;
  out.globalCompositeOperation = "soft-light";
  out.fillStyle = `rgba(${r},${g},${b},${Math.min(1, amount)})`;
  out.fillRect(0, 0, width, height);
  // A lighter "color" blend pushes the hue toward the tint while keeping
  // luminance, which soft-light alone does only faintly.
  out.globalCompositeOperation = "color";
  out.fillStyle = `rgba(${r},${g},${b},${Math.min(1, amount * TINT_COLOR_BLEND_RATIO)})`;
  out.fillRect(0, 0, width, height);
  out.globalCompositeOperation = "destination-in";
  out.drawImage(input, 0, 0, width, height);
  out.globalCompositeOperation = "source-over";
}

function drawPixelated({
  input,
  out,
  width,
  height,
  blockSize,
}: {
  input: CanvasImageSource;
  out: Canvas2D;
  width: number;
  height: number;
  blockSize: number;
}) {
  const block = Math.max(1, Math.round(blockSize * (height / REFERENCE_HEIGHT)));
  if (block <= 1) {
    out.drawImage(input, 0, 0, width, height);
    return;
  }
  const smallW = Math.max(1, Math.ceil(width / block));
  const smallH = Math.max(1, Math.ceil(height / block));
  const small = getScratchContext({ width: smallW, height: smallH, slot: 2 });
  small.clearRect(0, 0, smallW, smallH);
  small.imageSmoothingEnabled = true;
  small.drawImage(input, 0, 0, smallW, smallH);
  out.imageSmoothingEnabled = false;
  out.drawImage(small.canvas, 0, 0, smallW, smallH, 0, 0, width, height);
  out.imageSmoothingEnabled = true;
}

function drawGrain({
  input,
  out,
  width,
  height,
  amount,
}: {
  input: CanvasImageSource;
  out: Canvas2D;
  width: number;
  height: number;
  amount: number;
}) {
  out.drawImage(input, 0, 0, width, height);
  if (amount <= 0) return;
  // A small tiled noise texture keeps this cheap at full HD.
  const tile = getNoiseTile();
  const pattern = out.createPattern(tile, "repeat");
  if (!pattern) return;
  out.globalCompositeOperation = "source-atop";
  out.globalAlpha = Math.min(1, amount);
  out.fillStyle = pattern;
  // Shift the tile each call so the grain moves between frames.
  const dx = Math.floor(Math.random() * NOISE_TILE_SIZE);
  const dy = Math.floor(Math.random() * NOISE_TILE_SIZE);
  out.translate(-dx, -dy);
  out.fillRect(0, 0, width + dx, height + dy);
  out.translate(dx, dy);
  out.globalAlpha = 1;
  out.globalCompositeOperation = "source-over";
}

const NOISE_TILE_SIZE = 256;
let noiseTile: OffscreenCanvas | null = null;

function getNoiseTile(): OffscreenCanvas {
  if (noiseTile) return noiseTile;
  noiseTile = new OffscreenCanvas(NOISE_TILE_SIZE, NOISE_TILE_SIZE);
  const ctx = noiseTile.getContext("2d")!;
  const image = ctx.createImageData(NOISE_TILE_SIZE, NOISE_TILE_SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() * 255;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 90;
  }
  ctx.putImageData(image, 0, 0);
  return noiseTile;
}

const scratchContexts: (OffscreenCanvasRenderingContext2D | null)[] = [null, null, null];

function getScratchContext({
  width,
  height,
  slot = 0,
}: {
  width: number;
  height: number;
  slot?: number;
}): OffscreenCanvasRenderingContext2D {
  let ctx = scratchContexts[slot];
  if (!ctx) {
    ctx = new OffscreenCanvas(width, height).getContext("2d")!;
    scratchContexts[slot] = ctx;
  }
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  return ctx;
}

function num(value: EffectUniformValue | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : (value[0] ?? 0);
}
