/**
 * Reusable bar+line chart for factor-level data (diagnostics and exploration).
 */

import { memo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface ChartLine {
  key: string;
  name: string;
  color: string;
}

export interface ChartRow {
  label: string;
  volume: number;
  n: number;
  exposure: number;
  rate1?: number;
  rate2?: number;
  [k: string]: any;
}

export default memo(function FactorChart({
  title,
  data,
  hasExposure,
  lines,
  rotateLabels = false,
  tooltipType,
}: {
  title: string;
  data: ChartRow[];
  hasExposure: boolean;
  lines: ChartLine[];
  rotateLabels?: boolean;
  tooltipType: "diag" | "explore";
}) {
  const volumeLabel = hasExposure ? "Exposure" : "Count";

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
        <p className="mb-1 font-semibold text-foreground">{label}</p>
        {tooltipType === "diag" ? (
          <>
            <p className="text-blue-400">Actual: {d?.rate1?.toFixed(4)}</p>
            <p className="text-emerald-400">Predicted: {d?.rate2?.toFixed(4)}</p>
          </>
        ) : (
          <p className="text-blue-400">Rate: {d?.rate1?.toFixed(4)}</p>
        )}
        <p className="text-muted-foreground">{volumeLabel}: {d?.volume?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
        <p className="text-muted-foreground/70">n = {d?.n?.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              interval={0}
              angle={rotateLabels ? -35 : 0}
              textAnchor={rotateLabels ? "end" : "middle"}
              height={rotateLabels ? 60 : 30}
            />
            <YAxis yAxisId="vol" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
            <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)" }} />
            <Bar yAxisId="vol" dataKey="volume" name={volumeLabel} fill="hsl(220 15% 40% / 0.35)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {lines.map((l) => (
              <Line key={l.key} yAxisId="rate" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3, fill: l.color }} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
})
