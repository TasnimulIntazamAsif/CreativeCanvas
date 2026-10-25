import type { ParamDefinition, ParamValues } from "../../params";
import { applyAlignedStroke } from "../stroke";
import { STROKE_ALIGN_PARAM, type GraphicStrokeAlign } from "./shared";
import type { GraphicDefinition } from "../types";

// Additional shapes described as outlines in a unit box (0..1 on both axes),
// scaled into the drawing area. They share the fill / stroke / stroke-align
// params of the built-in shapes, plus optional shape-specific params.

const BASE_PARAMS: ParamDefinition[] = [
  { key: "fill", label: "Fill", type: "color", default: "#ffffff" },
  { key: "stroke", label: "Color", type: "color", default: "#000000", group: "stroke" },
  {
    key: "strokeWidth",
    label: "Width",
    type: "number",
    default: 0,
    min: 0,
    max: 64,
    step: 1,
    shortLabel: "W",
    group: "stroke",
  },
  STROKE_ALIGN_PARAM,
];

const THICKNESS_PARAM: ParamDefinition = {
  key: "thickness",
  label: "Thickness",
  type: "number",
  default: 30,
  min: 5,
  max: 90,
  step: 1,
  shortLabel: "T",
};

/** Maps unit-box coordinates onto the drawing area. */
interface Box {
  x: (u: number) => number;
  y: (v: number) => number;
  /** Scales a unit length using the shorter side (keeps curves round). */
  r: (u: number) => number;
  width: number;
  height: number;
}

type BuildPath = (box: Box, params: ParamValues) => Path2D;

export const triangleGraphicDefinition = outlineShape({
  id: "triangle",
  name: "Triangle",
  keywords: ["triangle", "play", "pyramid"],
  build: (b) => polygon(b, [[0.5, 0], [1, 1], [0, 1]]),
});

export const rightTriangleGraphicDefinition = outlineShape({
  id: "right-triangle",
  name: "Right Triangle",
  keywords: ["right triangle", "corner", "wedge"],
  build: (b) => polygon(b, [[0, 0], [1, 1], [0, 1]]),
});

export const diamondGraphicDefinition = outlineShape({
  id: "diamond",
  name: "Diamond",
  keywords: ["diamond", "rhombus", "gem"],
  build: (b) => polygon(b, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
});

export const trapezoidGraphicDefinition = outlineShape({
  id: "trapezoid",
  name: "Trapezoid",
  keywords: ["trapezoid", "trapezium"],
  build: (b) => polygon(b, [[0.2, 0.15], [0.8, 0.15], [1, 0.85], [0, 0.85]]),
});

export const parallelogramGraphicDefinition = outlineShape({
  id: "parallelogram",
  name: "Parallelogram",
  keywords: ["parallelogram", "slant", "skew"],
  build: (b) => polygon(b, [[0.25, 0.2], [1, 0.2], [0.75, 0.8], [0, 0.8]]),
});

export const semicircleGraphicDefinition = outlineShape({
  id: "semicircle",
  name: "Semicircle",
  keywords: ["semicircle", "half circle", "dome", "arch"],
  build: (b) => {
    const path = new Path2D();
    path.ellipse(b.x(0.5), b.y(0.75), b.width / 2, b.height / 2, 0, Math.PI, Math.PI * 2);
    path.closePath();
    return path;
  },
});

export const ringGraphicDefinition = outlineShape({
  id: "ring",
  name: "Ring",
  keywords: ["ring", "donut", "circle outline", "o"],
  extraParams: [THICKNESS_PARAM],
  build: (b, params) => {
    const thickness = clampPercent(params.thickness, 30);
    const path = new Path2D();
    const rx = b.width / 2;
    const ry = b.height / 2;
    path.ellipse(b.x(0.5), b.y(0.5), rx, ry, 0, 0, Math.PI * 2);
    // Inner ellipse drawn the other way round so nonzero fill leaves a hole.
    path.moveTo(b.x(0.5) + rx * (1 - thickness), b.y(0.5));
    path.ellipse(b.x(0.5), b.y(0.5), rx * (1 - thickness), ry * (1 - thickness), 0, 0, Math.PI * 2, true);
    return path;
  },
});

export const crescentGraphicDefinition = outlineShape({
  id: "crescent",
  name: "Crescent",
  keywords: ["crescent", "moon", "night"],
  build: (b) => {
    // Unit circle at (0.5, 0.5) minus the same circle shifted right by `d`.
    const d = 0.35;
    const radius = 0.5;
    const halfChord = Math.sqrt(radius * radius - (d / 2) * (d / 2));
    const topOuter = Math.atan2(-halfChord, d / 2);
    const bottomOuter = Math.atan2(halfChord, d / 2);
    const bottomInner = Math.atan2(halfChord, -d / 2);
    const topInner = Math.atan2(-halfChord, -d / 2);
    const path = new Path2D();
    const r = Math.min(b.width, b.height) / 2;
    path.arc(b.x(0.5), b.y(0.5), r, topOuter, bottomOuter, true);
    path.arc(b.x(0.5) + d * r * 2, b.y(0.5), r, bottomInner, topInner + Math.PI * 2, false);
    path.closePath();
    return path;
  },
});

export const heartGraphicDefinition = outlineShape({
  id: "heart",
  name: "Heart",
  keywords: ["heart", "love", "like"],
  build: (b) => {
    const p = new Path2D();
    p.moveTo(b.x(0.5), b.y(0.3));
    p.bezierCurveTo(b.x(0.5), b.y(0.25), b.x(0.42), b.y(0.08), b.x(0.24), b.y(0.08));
    p.bezierCurveTo(b.x(0), b.y(0.08), b.x(0), b.y(0.38), b.x(0), b.y(0.38));
    p.bezierCurveTo(b.x(0), b.y(0.6), b.x(0.22), b.y(0.8), b.x(0.5), b.y(0.96));
    p.bezierCurveTo(b.x(0.78), b.y(0.8), b.x(1), b.y(0.6), b.x(1), b.y(0.38));
    p.bezierCurveTo(b.x(1), b.y(0.38), b.x(1), b.y(0.08), b.x(0.76), b.y(0.08));
    p.bezierCurveTo(b.x(0.58), b.y(0.08), b.x(0.5), b.y(0.25), b.x(0.5), b.y(0.3));
    p.closePath();
    return p;
  },
});

export const arrowGraphicDefinition = outlineShape({
  id: "arrow",
  name: "Arrow",
  keywords: ["arrow", "right", "next", "direction"],
  extraParams: [{ ...THICKNESS_PARAM, default: 34 }],
  build: (b, params) => {
    const t = clampPercent(params.thickness, 34) / 2;
    return polygon(b, [
      [0, 0.5 - t], [0.6, 0.5 - t], [0.6, 0.12], [1, 0.5],
      [0.6, 0.88], [0.6, 0.5 + t], [0, 0.5 + t],
    ]);
  },
});

export const doubleArrowGraphicDefinition = outlineShape({
  id: "double-arrow",
  name: "Double Arrow",
  keywords: ["double arrow", "both ways", "left right", "swap"],
  extraParams: [{ ...THICKNESS_PARAM, default: 30 }],
  build: (b, params) => {
    const t = clampPercent(params.thickness, 30) / 2;
    return polygon(b, [
      [0, 0.5], [0.28, 0.15], [0.28, 0.5 - t], [0.72, 0.5 - t], [0.72, 0.15], [1, 0.5],
      [0.72, 0.85], [0.72, 0.5 + t], [0.28, 0.5 + t], [0.28, 0.85],
    ]);
  },
});

export const chevronGraphicDefinition = outlineShape({
  id: "chevron",
  name: "Chevron",
  keywords: ["chevron", "angle", "next", "caret"],
  build: (b) => polygon(b, [[0.05, 0.1], [0.55, 0.1], [0.95, 0.5], [0.55, 0.9], [0.05, 0.9], [0.45, 0.5]]),
});

export const crossGraphicDefinition = outlineShape({
  id: "cross",
  name: "Cross",
  keywords: ["cross", "plus", "add", "medical"],
  extraParams: [{ ...THICKNESS_PARAM, default: 32 }],
  build: (b, params) => {
    const t = clampPercent(params.thickness, 32) / 2;
    const lo = 0.5 - t;
    const hi = 0.5 + t;
    return polygon(b, [
      [lo, 0], [hi, 0], [hi, lo], [1, lo], [1, hi], [hi, hi],
      [hi, 1], [lo, 1], [lo, hi], [0, hi], [0, lo], [lo, lo],
    ]);
  },
});

export const lineGraphicDefinition = outlineShape({
  id: "line",
  name: "Line",
  keywords: ["line", "bar", "divider", "underline", "stripe"],
  extraParams: [{ ...THICKNESS_PARAM, default: 8, min: 1, max: 100 }],
  build: (b, params) => {
    const t = clampPercent(params.thickness, 8) / 2;
    return polygon(b, [[0, 0.5 - t], [1, 0.5 - t], [1, 0.5 + t], [0, 0.5 + t]]);
  },
});

export const speechBubbleGraphicDefinition = outlineShape({
  id: "speech-bubble",
  name: "Speech Bubble",
  keywords: ["speech bubble", "chat", "comment", "talk", "callout"],
  build: (b) => {
    const r = b.r(0.12);
    const bottom = 0.75;
    const p = new Path2D();
    p.moveTo(b.x(0) + r, b.y(0));
    p.lineTo(b.x(1) - r, b.y(0));
    p.arcTo(b.x(1), b.y(0), b.x(1), b.y(0) + r, r);
    p.lineTo(b.x(1), b.y(bottom) - r);
    p.arcTo(b.x(1), b.y(bottom), b.x(1) - r, b.y(bottom), r);
    p.lineTo(b.x(0.45), b.y(bottom));
    p.lineTo(b.x(0.2), b.y(1));
    p.lineTo(b.x(0.27), b.y(bottom));
    p.lineTo(b.x(0) + r, b.y(bottom));
    p.arcTo(b.x(0), b.y(bottom), b.x(0), b.y(bottom) - r, r);
    p.lineTo(b.x(0), b.y(0) + r);
    p.arcTo(b.x(0), b.y(0), b.x(0) + r, b.y(0), r);
    p.closePath();
    return p;
  },
});

export const cloudGraphicDefinition = outlineShape({
  id: "cloud",
  name: "Cloud",
  keywords: ["cloud", "weather", "sky", "thought"],
  build: (b) => {
    const p = new Path2D();
    p.moveTo(b.x(0.22), b.y(0.82));
    p.bezierCurveTo(b.x(0.02), b.y(0.82), b.x(0.02), b.y(0.52), b.x(0.2), b.y(0.52));
    p.bezierCurveTo(b.x(0.18), b.y(0.3), b.x(0.42), b.y(0.22), b.x(0.5), b.y(0.36));
    p.bezierCurveTo(b.x(0.58), b.y(0.14), b.x(0.88), b.y(0.2), b.x(0.84), b.y(0.44));
    p.bezierCurveTo(b.x(1), b.y(0.46), b.x(1), b.y(0.82), b.x(0.8), b.y(0.82));
    p.closePath();
    return p;
  },
});

export const lightningGraphicDefinition = outlineShape({
  id: "lightning",
  name: "Lightning",
  keywords: ["lightning", "bolt", "flash", "energy", "power"],
  build: (b) =>
    polygon(b, [[0.6, 0], [0.15, 0.58], [0.47, 0.58], [0.38, 1], [0.85, 0.38], [0.53, 0.38], [0.68, 0]]),
});

export const OUTLINE_SHAPE_DEFINITIONS: GraphicDefinition[] = [
  triangleGraphicDefinition,
  rightTriangleGraphicDefinition,
  diamondGraphicDefinition,
  trapezoidGraphicDefinition,
  parallelogramGraphicDefinition,
  semicircleGraphicDefinition,
  ringGraphicDefinition,
  crescentGraphicDefinition,
  heartGraphicDefinition,
  arrowGraphicDefinition,
  doubleArrowGraphicDefinition,
  chevronGraphicDefinition,
  crossGraphicDefinition,
  lineGraphicDefinition,
  speechBubbleGraphicDefinition,
  cloudGraphicDefinition,
  lightningGraphicDefinition,
];

function outlineShape({
  id,
  name,
  keywords,
  extraParams = [],
  build,
}: {
  id: string;
  name: string;
  keywords: string[];
  extraParams?: ParamDefinition[];
  build: BuildPath;
}): GraphicDefinition {
  return {
    id,
    name,
    keywords,
    params: [...BASE_PARAMS, ...extraParams],
    render({ ctx, params, width, height }) {
      const fill = String(params.fill ?? "#ffffff");
      const stroke = String(params.stroke ?? "#000000");
      const strokeWidth = Math.max(0, Number(params.strokeWidth ?? 0));
      const strokeAlign = (params.strokeAlign ?? "center") as GraphicStrokeAlign;
      // A centered stroke straddles the outline; inset so it isn't clipped.
      const inset = strokeAlign === "center" ? strokeWidth / 2 : 0;
      const drawWidth = Math.max(1, width - inset * 2);
      const drawHeight = Math.max(1, height - inset * 2);
      const box: Box = {
        x: (u) => inset + u * drawWidth,
        y: (v) => inset + v * drawHeight,
        r: (u) => u * Math.min(drawWidth, drawHeight),
        width: drawWidth,
        height: drawHeight,
      };

      ctx.clearRect(0, 0, width, height);
      const path = build(box, params);
      ctx.fillStyle = fill;
      ctx.fill(path);

      if (strokeWidth > 0) {
        applyAlignedStroke({ ctx, path, strokeWidth, strokeAlign, strokeColor: stroke });
      }
    },
  };
}

function polygon(box: Box, points: [number, number][]): Path2D {
  const path = new Path2D();
  points.forEach(([u, v], index) => {
    if (index === 0) path.moveTo(box.x(u), box.y(v));
    else path.lineTo(box.x(u), box.y(v));
  });
  path.closePath();
  return path;
}

/** Reads a percent param (0-100) as a 0-1 fraction. */
function clampPercent(value: unknown, fallback: number): number {
  const num = Number(value ?? fallback);
  return Math.max(0.01, Math.min(1, (Number.isFinite(num) ? num : fallback) / 100));
}
