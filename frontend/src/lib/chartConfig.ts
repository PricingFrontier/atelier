export const CHART_AXIS_STYLE = {
  tick: { fontSize: 10, fill: "rgba(255,255,255,0.65)" },
  axisLine: { stroke: "rgba(255,255,255,0.15)" },
  tickLine: false,
} as const;

export const CHART_GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.12)",
} as const;

export const CHART_MARGINS = {
  default: { top: 8, right: 16, bottom: 4, left: 0 },
} as const;

export const CHART_COLORS = {
  bar: "hsl(220 20% 45% / 0.5)",
  actual: "hsl(210 100% 60%)",
  predicted: "hsl(38 92% 56%)",
  relativity: "hsl(168 84% 49%)",
  reference: "rgba(255,255,255,0.3)",
  referenceDash: "4 4",
} as const;
