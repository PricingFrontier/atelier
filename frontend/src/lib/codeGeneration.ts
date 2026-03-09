import type { ModelConfig, TermSpec } from "@/types";

/**
 * Generate Python code that reproduces the current model using rustystats.
 * Pure function — no React dependencies.
 */
export function generateRustystatsCode(config: ModelConfig, terms: TermSpec[]): string {
  const lines: string[] = [
    "import polars as pl",
    "import rustystats as rs",
    "",
    `df = pl.read_csv("${config.datasetPath?.split("/").pop() ?? "data.csv"}")`,
    "",
  ];

  // Build terms dict
  const termEntries: string[] = [];
  const seen = new Map<string, number>();

  for (const t of terms) {
    const parts: string[] = [`"type": "${t.type}"`];
    if (t.df != null) parts.push(`"df": ${t.df}`);
    if (t.k != null) parts.push(`"k": ${t.k}`);
    if (t.monotonicity) parts.push(`"monotonicity": "${t.monotonicity}"`);
    if (t.type === "expression" && t.expr) parts.push(`"expr": "${t.expr}"`);

    let key: string;
    if (t.type === "expression") {
      key = t.expr ?? t.column;
    } else {
      const count = seen.get(t.column) ?? 0;
      if (count > 0 && (t.type === "target_encoding" || t.type === "frequency_encoding")) {
        key = `${t.column}__${t.type}`;
        parts.push(`"variable": "${t.column}"`);
      } else {
        key = t.column;
      }
      seen.set(t.column, count + 1);
    }

    termEntries.push(`    "${key}": {${parts.join(", ")}}`);
  }

  lines.push("terms = {");
  lines.push(termEntries.join(",\n"));
  lines.push("}");
  lines.push("");

  // Build glm_dict call
  const kwargs: string[] = [
    `    response="${config.response}"`,
    "    terms=terms",
    "    data=df",
    `    family="${config.family}"`,
  ];
  if (config.link && config.link !== "canonical") {
    kwargs.push(`    link="${config.link}"`);
  }
  if (config.offset) {
    kwargs.push(`    offset="${config.offset}"`);
  }
  if (config.weights) {
    kwargs.push(`    weights="${config.weights}"`);
  }

  lines.push("model = rs.glm_dict(");
  lines.push(kwargs.join(",\n") + ",");
  lines.push(")");
  lines.push("");
  lines.push("result = model.fit()");
  lines.push("print(result.summary())");

  return lines.join("\n");
}
