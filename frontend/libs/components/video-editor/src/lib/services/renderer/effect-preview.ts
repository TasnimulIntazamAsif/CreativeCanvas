import { createCanvasSurface } from "./canvas-utils";
import { effectsRegistry, resolveEffectPasses } from "../../effects";
import { buildDefaultParamValues } from "../../params/registry";
import type { ParamValues } from "../../params";
import { gpuRenderer } from "./gpu-renderer";

const PREVIEW_SIZE = 160;
const PREVIEW_IMAGE_PATH = "/effects/preview.jpg";

class EffectPreviewService {
  private testSourceCanvas: OffscreenCanvas | null = null;
  private previewImageElement: HTMLImageElement | null = null;
  private onReadyCallbacks = new Set<() => void>();

  readonly PREVIEW_SIZE = PREVIEW_SIZE;

  constructor() {
    this.loadPreviewImage();
  }

  onPreviewImageReady({ callback }: { callback: () => void }): () => void {
    this.onReadyCallbacks.add(callback);
    return () => this.onReadyCallbacks.delete(callback);
  }

  renderPreview({
    effectType,
    params,
    targetCanvas,
    uniformDimensions,
  }: {
    effectType: string;
    params: ParamValues;
    targetCanvas: HTMLCanvasElement;
    uniformDimensions?: { width: number; height: number };
  }): void {
    const size = PREVIEW_SIZE;
    const targetCtx = targetCanvas.getContext(
      "2d",
    ) as CanvasRenderingContext2D | null;
    if (!targetCtx) {
      return;
    }

    targetCanvas.width = size;
    targetCanvas.height = size;

    const source = this.getTestSource({ width: size, height: size });
    if (!source) {
      targetCtx.clearRect(0, 0, size, size);
      return;
    }

    try {
      const definition = effectsRegistry.get(effectType);
      const resolvedParams =
        Object.keys(params).length > 0
          ? params
          : buildDefaultParamValues(definition.params);

      const passes = resolveEffectPasses({
        definition,
        effectParams: resolvedParams,
        width: uniformDimensions?.width ?? size,
        height: uniformDimensions?.height ?? size,
      });
      const result = this.applyGpuEffect({
        source,
        width: size,
        height: size,
        passes,
      });

      targetCtx.drawImage(result, 0, 0, size, size);
    } catch (error) {
      console.warn("Failed to render effect preview", { effectType, error });
      targetCtx.clearRect(0, 0, size, size);
      targetCtx.drawImage(source, 0, 0, size, size);
    }
  }

  private loadPreviewImage(): void {
    if (typeof window === "undefined") return;
    const image = new Image();
    image.onload = () => {
      this.testSourceCanvas = null;
      for (const callback of this.onReadyCallbacks) {
        callback();
      }
    };
    image.src = PREVIEW_IMAGE_PATH;
    this.previewImageElement = image;
  }

  private createTestSource({
    width,
    height,
  }: {
    width: number;
    height: number;
  }): OffscreenCanvas | null {
    const isImageReady =
      this.previewImageElement?.complete &&
      (this.previewImageElement.naturalWidth ?? 0) > 0;

    const { canvas, context } = createCanvasSurface({ width, height });
    if (isImageReady && this.previewImageElement) {
      context.drawImage(this.previewImageElement, 0, 0, width, height);
    } else {
      // Hosts that don't ship PREVIEW_IMAGE_PATH still get readable
      // thumbnails: a small drawn scene with color, light and detail.
      drawFallbackPreviewScene({ context, width, height });
    }
    return canvas;
  }

  private getTestSource({
    width,
    height,
  }: {
    width: number;
    height: number;
  }): OffscreenCanvas | null {
    if (
      !this.testSourceCanvas ||
      this.testSourceCanvas.width !== width ||
      this.testSourceCanvas.height !== height
    ) {
      this.testSourceCanvas = this.createTestSource({ width, height });
    }
    return this.testSourceCanvas;
  }

  private applyGpuEffect({
    source,
    width,
    height,
    passes,
  }: {
    source: OffscreenCanvas;
    width: number;
    height: number;
    passes: ReturnType<typeof resolveEffectPasses>;
  }): OffscreenCanvas {
    return gpuRenderer.applyEffect({
      source,
      width,
      height,
      passes,
    });
  }
}

export const effectPreviewService = new EffectPreviewService();

function drawFallbackPreviewScene({
  context,
  width,
  height,
}: {
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  width: number;
  height: number;
}) {
  const sky = context.createLinearGradient(0, 0, 0, height * 0.65);
  sky.addColorStop(0, "#3b82f6");
  sky.addColorStop(1, "#f9a8d4");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#fde047";
  context.beginPath();
  context.arc(width * 0.7, height * 0.3, height * 0.13, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#16a34a";
  context.beginPath();
  context.moveTo(0, height * 0.7);
  context.quadraticCurveTo(width * 0.3, height * 0.45, width * 0.6, height * 0.68);
  context.quadraticCurveTo(width * 0.85, height * 0.55, width, height * 0.66);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  const blocks = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#8b5cf6"];
  const blockWidth = width / blocks.length;
  blocks.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index * blockWidth, height * 0.84, blockWidth, height * 0.16);
  });

  context.fillStyle = "#ffffff";
  context.font = `bold ${Math.round(height * 0.2)}px Arial, sans-serif`;
  context.textBaseline = "middle";
  context.fillText("Aa", width * 0.1, height * 0.27);
}
