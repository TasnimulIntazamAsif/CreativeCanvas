import { isCanvasPass, runCanvasPasses } from "../../../effects/canvas-passes";
import type { EffectPass } from "../../../effects/types";
import type {
  FrameDescriptor,
  FrameItemDescriptor,
  RenderedTextureDescriptor,
  TextureUploadDescriptor,
} from "./types";

// Applies `canvas2d:` effect passes before the frame reaches the wasm
// compositor (which only understands its built-in GPU shaders):
// - A layer's own canvas passes are baked into a derived copy of its texture.
// - A scene-level effect (adjustment layer) has its canvas passes pushed down
//   onto every layer beneath it, which matches the composite for these
//   per-pixel color effects.
// GPU passes (e.g. blur) are left in place and still run in wasm afterwards.

type LayerItem = Extract<FrameItemDescriptor, { type: "layer" }>;

export function applyCanvasEffects({
  frame,
  textures,
}: {
  frame: FrameDescriptor;
  textures: TextureUploadDescriptor[];
}): { frame: FrameDescriptor; textures: TextureUploadDescriptor[] } {
  if (!frameHasCanvasPasses(frame)) return { frame, textures };

  const textureById = new Map(textures.map((texture) => [texture.id, texture]));
  const inherited = collectInheritedPasses(frame.items);
  const derivedTextures = new Map<string, TextureUploadDescriptor>();

  const items: FrameItemDescriptor[] = [];
  frame.items.forEach((item, index) => {
    if (item.type === "sceneEffect") {
      const gpuGroups = stripCanvasPasses(item.effectPassGroups);
      if (gpuGroups.length > 0) items.push({ ...item, effectPassGroups: gpuGroups });
      return;
    }

    const canvasPasses = [
      ...item.effectPassGroups.flat().filter(isCanvasPass),
      ...inherited[index],
    ];
    const gpuGroups = stripCanvasPasses(item.effectPassGroups);
    const source = textureById.get(item.textureId);
    if (canvasPasses.length === 0 || !source) {
      items.push({ ...item, effectPassGroups: gpuGroups });
      return;
    }

    const derived = deriveTexture({ source, passes: canvasPasses });
    derivedTextures.set(derived.id, derived);
    items.push({ ...item, textureId: derived.id, effectPassGroups: gpuGroups } as LayerItem);
  });

  // Keep only textures still referenced (by a layer or a mask).
  const referenced = new Set<string>();
  for (const item of items) {
    if (item.type !== "layer") continue;
    referenced.add(item.textureId);
    if (item.mask) referenced.add(item.mask.textureId);
  }
  const nextTextures = [
    ...textures.filter((texture) => referenced.has(texture.id)),
    ...derivedTextures.values(),
  ];

  return { frame: { ...frame, items }, textures: nextTextures };
}

function frameHasCanvasPasses(frame: FrameDescriptor): boolean {
  return frame.items.some((item) => item.effectPassGroups.some((group) => group.some(isCanvasPass)));
}

// For each item index, the canvas passes of scene effects that sit above it.
function collectInheritedPasses(items: FrameItemDescriptor[]): EffectPass[][] {
  const inherited: EffectPass[][] = items.map(() => []);
  items.forEach((item, index) => {
    if (item.type !== "sceneEffect") return;
    const passes = item.effectPassGroups.flat().filter(isCanvasPass);
    if (passes.length === 0) return;
    for (let below = 0; below < index; below++) {
      if (items[below].type === "layer") inherited[below].push(...passes);
    }
  });
  return inherited;
}

function stripCanvasPasses(groups: EffectPass[][]): EffectPass[][] {
  return groups
    .map((group) => group.filter((pass) => !isCanvasPass(pass)))
    .filter((group) => group.length > 0);
}

function deriveTexture({
  source,
  passes,
}: {
  source: TextureUploadDescriptor;
  passes: EffectPass[];
}): RenderedTextureDescriptor {
  const passesKey = JSON.stringify(passes);
  const { width, height } = source;

  if (source.kind === "rendered") {
    return {
      kind: "rendered",
      id: `${source.id}:fx`,
      contentHash: `${source.contentHash}|fx:${passesKey}`,
      width,
      height,
      draw: (ctx) => {
        const scratch = new OffscreenCanvas(width, height);
        const scratchCtx = scratch.getContext("2d")!;
        source.draw(scratchCtx);
        runCanvasPasses({ target: ctx, source: scratch, width, height, passes });
      },
    };
  }

  return {
    kind: "rendered",
    id: `${source.id}:fx`,
    // External sources (video frames) are new objects per frame; key on
    // object identity so an unchanged still image isn't re-filtered.
    contentHash: `src:${sourceKey(source.source)}|${width}x${height}|fx:${passesKey}`,
    width,
    height,
    draw: (ctx) => {
      runCanvasPasses({ target: ctx, source: source.source, width, height, passes });
    },
  };
}

const sourceKeys = new WeakMap<object, number>();
let nextSourceKey = 1;

function sourceKey(source: CanvasImageSource): number {
  const key = source as unknown as object;
  let id = sourceKeys.get(key);
  if (id === undefined) {
    id = nextSourceKey++;
    sourceKeys.set(key, id);
  }
  return id;
}
