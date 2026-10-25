import {
  applyEffectPasses,
  applyMaskFeather as applyMaskFeatherWasm,
  initializeGpu,
} from "opencut-wasm";
import type { EffectPass, EffectUniformValue } from "../../effects/types";
import { isCanvasPass, runCanvasPasses } from "../../effects/canvas-passes";

let gpuAvailable = false;
let initPromise: Promise<void> | null = null;

export function initializeGpuRenderer(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeGpu()
      .then(() => {
        gpuAvailable = true;
      })
      .catch((error: unknown) => {
        gpuAvailable = false;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`GPU renderer unavailable: ${message}`);
      });
  }
  return initPromise;
}

export function isGpuAvailable(): boolean {
  return gpuAvailable;
}

export const gpuRenderer = {
  applyEffect({
    source,
    width,
    height,
    passes,
  }: {
    source: OffscreenCanvas;
    width: number;
    height: number;
    passes: EffectPass[];
  }): OffscreenCanvas {
    // Canvas passes run in JS first (no GPU needed); the rest go to wasm.
    const canvasPasses = passes.filter(isCanvasPass);
    const gpuPasses = passes.filter((pass) => !isCanvasPass(pass));

    let output = source;
    if (canvasPasses.length > 0) {
      output = new OffscreenCanvas(width, height);
      runCanvasPasses({
        target: output.getContext("2d")!,
        source,
        width,
        height,
        passes: canvasPasses,
      });
    }

    if (gpuPasses.length === 0 || !gpuAvailable) {
      return output;
    }

    return applyEffectPasses({
      source: output,
      width,
      height,
      passes: serializeEffectPasses(gpuPasses),
    });
  },

  applyMaskFeather({
    maskCanvas,
    width,
    height,
    feather,
  }: {
    maskCanvas: OffscreenCanvas;
    width: number;
    height: number;
    feather: number;
  }): OffscreenCanvas {
    if (!gpuAvailable) {
      return maskCanvas;
    }

    return applyMaskFeatherWasm({
      mask: maskCanvas,
      width,
      height,
      feather,
    });
  },
};

function serializeEffectPasses(passes: EffectPass[]) {
  return passes.map((pass) => ({
    shader: pass.shader,
    uniforms: Object.entries(pass.uniforms).map(([name, value]) => ({
      name,
      value: normalizeUniformValue(value),
    })),
  }));
}

function normalizeUniformValue(value: EffectUniformValue): number[] {
  return typeof value === "number" ? [value] : value;
}
