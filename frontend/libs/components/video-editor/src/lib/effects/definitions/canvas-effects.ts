import type { ParamValues } from "../../params";
import {
  CSS_FILTER_SHADER,
  GRAIN_SHADER,
  PIXELATE_SHADER,
  TINT_SHADER,
  VIGNETTE_SHADER,
} from "../canvas-passes";
import type { EffectDefinition, EffectUniformValue } from "../types";

// Color and stylize effects rendered by the 2D-canvas pass runner (see
// ../canvas-passes.ts). Params use friendly ranges (percent / degrees) and
// are converted to filter values here.

export const brightnessEffectDefinition = singlePassEffect({
  type: "brightness",
  name: "Brightness",
  keywords: ["brightness", "exposure", "light", "dark"],
  params: [percentParam({ key: "amount", label: "Amount", min: -100, max: 100, fallback: 35 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ brightness: 1 + read(p, "amount") / 100 }),
});

export const contrastEffectDefinition = singlePassEffect({
  type: "contrast",
  name: "Contrast",
  keywords: ["contrast", "punch"],
  params: [percentParam({ key: "amount", label: "Amount", min: -100, max: 100, fallback: 50 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ contrast: Math.max(0, 1 + read(p, "amount") / 100) }),
});

export const saturationEffectDefinition = singlePassEffect({
  type: "saturation",
  name: "Saturation",
  keywords: ["saturation", "vibrance", "color", "vivid"],
  params: [percentParam({ key: "amount", label: "Amount", min: -100, max: 100, fallback: 80 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ saturate: Math.max(0, 1 + read(p, "amount") / 100) }),
});

export const blackWhiteEffectDefinition = singlePassEffect({
  type: "black-white",
  name: "Black & White",
  keywords: ["black and white", "grayscale", "monochrome", "b&w"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 100 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ grayscale: read(p, "intensity") / 100 }),
});

export const sepiaEffectDefinition = singlePassEffect({
  type: "sepia",
  name: "Sepia",
  keywords: ["sepia", "old", "brown", "retro"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 80 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ sepia: read(p, "intensity") / 100 }),
});

export const invertEffectDefinition = singlePassEffect({
  type: "invert",
  name: "Invert",
  keywords: ["invert", "negative"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 100 })],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ invert: read(p, "intensity") / 100 }),
});

export const hueShiftEffectDefinition = singlePassEffect({
  type: "hue-shift",
  name: "Hue Shift",
  keywords: ["hue", "color shift", "tint"],
  params: [
    { key: "degrees", label: "Degrees", type: "number", default: 90, min: -180, max: 180, step: 1 },
  ],
  shader: CSS_FILTER_SHADER,
  uniforms: (p) => ({ hueRotate: read(p, "degrees") }),
});

export const warmEffectDefinition: EffectDefinition = {
  type: "warm",
  name: "Warm",
  keywords: ["warm", "golden", "sunset", "orange"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 60 })],
  renderer: {
    passes: [
      {
        shader: TINT_SHADER,
        uniforms: ({ effectParams }) => ({
          color: [255, 140, 20],
          amount: 0.85 * (read(effectParams, "intensity") / 100),
        }),
      },
      {
        shader: CSS_FILTER_SHADER,
        uniforms: ({ effectParams }) => ({
          saturate: 1 + 0.2 * (read(effectParams, "intensity") / 100),
        }),
      },
    ],
  },
};

export const coolEffectDefinition: EffectDefinition = {
  type: "cool",
  name: "Cool",
  keywords: ["cool", "cold", "blue", "teal"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 60 })],
  renderer: {
    passes: [
      {
        shader: TINT_SHADER,
        uniforms: ({ effectParams }) => ({
          color: [20, 120, 255],
          amount: 0.85 * (read(effectParams, "intensity") / 100),
        }),
      },
      {
        shader: CSS_FILTER_SHADER,
        uniforms: ({ effectParams }) => ({
          saturate: 1 - 0.1 * (read(effectParams, "intensity") / 100),
        }),
      },
    ],
  },
};

export const vignetteEffectDefinition = singlePassEffect({
  type: "vignette",
  name: "Vignette",
  keywords: ["vignette", "dark edges", "cinematic"],
  params: [
    percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 60 }),
    percentParam({ key: "size", label: "Size", min: 0, max: 95, fallback: 45 }),
  ],
  shader: VIGNETTE_SHADER,
  uniforms: (p) => ({ intensity: read(p, "intensity") / 100, size: read(p, "size") / 100 }),
});

export const pixelateEffectDefinition = singlePassEffect({
  type: "pixelate",
  name: "Pixelate",
  keywords: ["pixelate", "mosaic", "censor", "8-bit"],
  params: [
    { key: "blockSize", label: "Block size", type: "number", default: 24, min: 2, max: 120, step: 1 },
  ],
  shader: PIXELATE_SHADER,
  uniforms: (p) => ({ blockSize: read(p, "blockSize") }),
});

export const filmGrainEffectDefinition = singlePassEffect({
  type: "film-grain",
  name: "Film Grain",
  keywords: ["grain", "noise", "film", "analog"],
  params: [percentParam({ key: "amount", label: "Amount", min: 0, max: 100, fallback: 35 })],
  shader: GRAIN_SHADER,
  uniforms: (p) => ({ amount: read(p, "amount") / 100 }),
});

export const vintageEffectDefinition: EffectDefinition = {
  type: "vintage",
  name: "Vintage",
  keywords: ["vintage", "retro", "old film", "faded"],
  params: [percentParam({ key: "intensity", label: "Intensity", min: 0, max: 100, fallback: 70 })],
  renderer: {
    passes: [
      {
        shader: CSS_FILTER_SHADER,
        uniforms: ({ effectParams }) => {
          const t = read(effectParams, "intensity") / 100;
          return { sepia: 0.55 * t, contrast: 1 - 0.12 * t, saturate: 1 - 0.2 * t, brightness: 1 + 0.05 * t };
        },
      },
      {
        shader: VIGNETTE_SHADER,
        uniforms: ({ effectParams }) => ({
          intensity: 0.55 * (read(effectParams, "intensity") / 100),
          size: 0.4,
        }),
      },
    ],
  },
};

export const CANVAS_EFFECT_DEFINITIONS: EffectDefinition[] = [
  brightnessEffectDefinition,
  contrastEffectDefinition,
  saturationEffectDefinition,
  blackWhiteEffectDefinition,
  sepiaEffectDefinition,
  warmEffectDefinition,
  coolEffectDefinition,
  vintageEffectDefinition,
  vignetteEffectDefinition,
  hueShiftEffectDefinition,
  invertEffectDefinition,
  pixelateEffectDefinition,
  filmGrainEffectDefinition,
];

function singlePassEffect({
  type,
  name,
  keywords,
  params,
  shader,
  uniforms,
}: {
  type: string;
  name: string;
  keywords: string[];
  params: EffectDefinition["params"];
  shader: string;
  uniforms: (effectParams: ParamValues) => Record<string, EffectUniformValue>;
}): EffectDefinition {
  return {
    type,
    name,
    keywords,
    params,
    renderer: {
      passes: [{ shader, uniforms: ({ effectParams }) => uniforms(effectParams) }],
    },
  };
}

function percentParam({
  key,
  label,
  min,
  max,
  fallback,
}: {
  key: string;
  label: string;
  min: number;
  max: number;
  fallback: number;
}): EffectDefinition["params"][number] {
  return { key, label, type: "number", default: fallback, min, max, step: 1 };
}

function read(params: ParamValues, key: string): number {
  const raw = params[key];
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
}
