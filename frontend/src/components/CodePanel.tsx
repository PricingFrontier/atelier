import { useState, useMemo, useCallback } from "react";
import { Code2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateRustystatsCode } from "@/lib/codeGeneration";
import type { ModelConfig, TermSpec } from "@/types";

export interface CodePanelProps {
  config: ModelConfig;
  terms: TermSpec[];
}

export default function CodePanel({ config, terms }: CodePanelProps) {
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => generateRustystatsCode(config, terms), [config, terms]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <Code2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">rustystats Code</p>
            <p className="text-[0.7rem] text-muted-foreground/50">
              Python code to reproduce this model
            </p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            copied
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-accent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rounded-xl border border-border bg-background p-5">
        <pre className="overflow-x-auto font-mono text-[0.8rem] leading-relaxed text-foreground/80">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
