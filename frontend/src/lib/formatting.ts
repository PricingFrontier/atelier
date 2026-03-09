export function fmt(v: number | null | undefined, dp: number): string {
  if (v == null) return "\u2014";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function pFmt(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  if (p < 0.0001) return "<0.0001";
  return p.toFixed(4);
}

export function pctFmt(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return (v * 100).toFixed(2) + "%";
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function truncateLabel(label: string, maxLength: number = 14): string {
  return label.length > maxLength ? label.slice(0, maxLength - 1) + "\u2026" : label;
}
