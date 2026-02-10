import { useState, useCallback, useRef, useEffect, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ArrowRight,
  Check,
  Database,
  GitBranch,
  Sigma,
  Weight,
  Layers,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FAMILY_OPTIONS,
  LINK_OPTIONS,
  CANONICAL_LINKS,
  type Family,
  type Link,
} from "@/lib/constants";
import type { ColumnMeta, ModelConfig } from "@/types";

function AnimatedSection({
  children,
  delay = 0,
  className = "",
  zIndex,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  zIndex?: number;
}) {
  return (
    <div
      className={cn("relative", className)}
      style={{
        animation: `fadeUp 0.6s ease-out ${delay}s both`,
        zIndex,
      }}
    >
      {children}
    </div>
  );
}

export default function ModelConfigPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prev = location.state as ModelConfig | null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(prev?.projectId ?? null);
  const [projectName, setProjectName] = useState(prev?.projectName ?? "");

  // Dataset state
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>(prev?.columns ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [datasetPath, setDatasetPath] = useState<string | null>(prev?.datasetPath ?? null);

  // Model spec state
  const [response, setResponse] = useState<string | null>(prev?.response ?? null);
  const [family, setFamily] = useState<Family | null>((prev?.family as Family) ?? null);
  const [link, setLink] = useState<Link | null>(() => {
    if (!prev) return null;
    const canonical = CANONICAL_LINKS[prev.family as Family];
    return prev.link === canonical ? null : (prev.link as Link);
  });
  const [offset, setOffset] = useState<string | null>(prev?.offset ?? null);
  const [weights, setWeights] = useState<string | null>(prev?.weights ?? null);

  // Data split state
  const [splitColumn, setSplitColumn] = useState<string | null>(prev?.split?.column ?? null);
  const [splitValues, setSplitValues] = useState<string[]>([]);
  const [splitMapping, setSplitMapping] = useState<Record<string, "train" | "validation" | "holdout" | null>>(prev?.split?.mapping ?? {});
  const [loadingValues, setLoadingValues] = useState(false);

  // Mouse glow
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Fetch unique values when split column changes
  const restoredSplitRef = useRef(!!prev?.split);
  useEffect(() => {
    if (!splitColumn || !datasetPath) {
      setSplitValues([]);
      setSplitMapping({});
      return;
    }
    setLoadingValues(true);
    fetch("/api/datasets/column-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_path: datasetPath, column: splitColumn }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.values) {
          setSplitValues(data.values);
          if (restoredSplitRef.current) {
            // First load with restored config — keep the saved mapping
            restoredSplitRef.current = false;
          } else {
            setSplitMapping(Object.fromEntries(data.values.map((v: string) => [v, null])));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingValues(false));
  }, [splitColumn, datasetPath]);

  // Derived
  const numericCols = columns.filter((c) => c.is_numeric);
  const canonicalLink = family ? CANONICAL_LINKS[family] : null;
  const effectiveLink = link ?? canonicalLink;

  const handleFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/datasets/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      setColumns(data.columns);
      setDatasetPath(data.file_path);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileRef.current.files = dt.files;
      fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, []);

  const handleFamilyChange = (f: Family) => {
    setFamily(f);
    setLink(null);
  };

  const hasData = columns.length > 0;
  const isValid = hasData && response !== null && family !== null && projectName.trim().length > 0;

  const handleContinue = async () => {
    const splitConfig = splitColumn ? { column: splitColumn, mapping: splitMapping } : null;

    let pid = projectId;
    if (!pid) {
      // Create a new project
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projectName.trim(),
            config: {
              dataset_path: datasetPath,
              response,
              family,
              link: effectiveLink,
              offset,
              weights,
              split: splitConfig,
              columns,
            },
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        pid = data.id;
        setProjectId(pid);
      } catch {
        return;
      }
    } else {
      // Update existing project config
      fetch(`/api/projects/${pid}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            dataset_path: datasetPath,
            response,
            family,
            link: effectiveLink,
            offset,
            weights,
            split: splitConfig,
            columns,
          },
        }),
      }).catch(() => {});
    }

    navigate("/model", {
      state: { projectId: pid, projectName: projectName.trim(), response, family, link: effectiveLink, offset, weights, columns, datasetPath, split: splitConfig },
    });
  };

  // Steps for the progress indicator
  const steps = [
    { label: "Data", icon: Database, done: hasData },
    { label: "Response", icon: Sigma, done: response !== null },
    { label: "Distribution", icon: GitBranch, done: family !== null },
    { label: "Offset / Weights", icon: Weight, done: offset !== null || weights !== null },
    { label: "Data Split", icon: Layers, done: splitColumn !== null },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(#1e1e22 1px, transparent 1px), linear-gradient(90deg, #1e1e22 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 50% 60% at 50% 30%, black 10%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 50% 60% at 50% 30%, black 10%, transparent 100%)",
        }}
      />

      {/* Ambient glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-[10%] h-[500px] w-[500px] animate-[auroraFloat1_12s_ease-in-out_infinite] rounded-full bg-blue-500 opacity-[0.04] blur-[120px]" />
        <div className="absolute top-[60%] right-[5%] h-[400px] w-[400px] animate-[auroraFloat2_14s_ease-in-out_infinite] rounded-full bg-violet-500 opacity-[0.04] blur-[120px]" />
      </div>

      {/* Cursor glow */}
      <div
        className="pointer-events-none fixed z-[1] h-[400px] w-[400px] rounded-full"
        style={{
          left: mousePos.x,
          top: mousePos.y,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, hsl(210 100% 60% / 0.04) 0%, transparent 70%)",
          transition: "left 0.2s ease-out, top 0.2s ease-out",
        }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5 backdrop-blur-xl"
        style={{
          background: "linear-gradient(180deg, hsl(0 0% 5% / 0.9) 0%, hsl(0 0% 4% / 0.8) 100%)",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-white/[0.08]" />
        <span className="text-sm font-medium tracking-wide text-foreground">New Model</span>
        {file && (
          <>
            <div className="h-4 w-px bg-white/[0.08]" />
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary/60" />
              {file.name}
            </span>
          </>
        )}
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
        {/* Step indicators */}
        <AnimatedSection delay={0}>
          <div className="mb-10 flex items-center justify-center gap-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-1">
                  {i > 0 && (
                    <div
                      className={cn(
                        "mx-1 h-px w-8 transition-colors duration-500",
                        s.done ? "bg-primary/30" : "bg-white/[0.06]"
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all duration-500",
                      s.done
                        ? "bg-primary/10 text-primary"
                        : "bg-white/[0.03] text-muted-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[0.55rem] font-semibold transition-all duration-500",
                        s.done
                          ? "bg-primary/20 text-primary"
                          : "bg-white/[0.06] text-muted-foreground"
                      )}
                    >
                      {s.done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </div>
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </AnimatedSection>

        {/* Data upload state */}
        {!hasData ? (
          <AnimatedSection delay={0.15} className="flex flex-1 flex-col items-center justify-center">
            <h2
              className="mb-2 bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-2xl font-light tracking-wide text-transparent"
            >
              Select your data
            </h2>
            <p className="mb-8 text-sm text-muted-foreground">
              Upload a CSV or Parquet file to get started.
            </p>

            {/* Upload drop zone with animated border */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="group relative w-full max-w-md cursor-pointer"
            >
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-16 transition-all",
                  dragOver && "border-primary/30 bg-[#0e0e12]",
                  !dragOver && !uploading && "group-hover:border-white/[0.12] group-hover:bg-[#0e0e12]"
                )}
              >
                <div
                  className={cn(
                    "mb-4 flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300",
                    uploading
                      ? "bg-primary/10 text-primary"
                      : "bg-white/[0.04] text-muted-foreground/50 group-hover:bg-primary/10 group-hover:text-primary/70"
                  )}
                >
                  <Upload className={cn("h-6 w-6", uploading && "animate-pulse")} />
                </div>
                <p className="text-sm font-medium text-foreground/80">
                  {uploading ? "Reading file…" : dragOver ? "Drop file here" : "Drop CSV or Parquet file"}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/50">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.parquet"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
            </div>
            {uploadError && (
              <p className="mt-4 text-sm text-destructive">{uploadError}</p>
            )}
          </AnimatedSection>
        ) : (
          <div className="space-y-6">
            {/* Project Name */}
            <AnimatedSection delay={0.02} zIndex={45}>
              <GlassCard>
                <CardHeader
                  icon={Pencil}
                  title="Project Name"
                  subtitle="A name for this modelling session."
                />
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Freq GLM – Motor 2025"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 transition-all focus:border-primary/30 focus:bg-white/[0.04] focus:outline-none focus:shadow-[0_0_0_1px_#3b82f620]"
                />
              </GlassCard>
            </AnimatedSection>

            {/* Response */}
            <AnimatedSection delay={0.05} zIndex={40}>
              <GlassCard>
                <CardHeader
                  icon={Sigma}
                  title="Response variable"
                  subtitle="The column your model will predict."
                />
                <SelectDropdown
                  value={response}
                  onChange={setResponse}
                  placeholder="Select response column"
                  options={numericCols.map((c) => ({
                    value: c.name,
                    label: c.name,
                    badge: c.dtype,
                  }))}
                />
              </GlassCard>
            </AnimatedSection>

            {/* Family & Link */}
            <AnimatedSection delay={0.15} zIndex={30}>
              <GlassCard>
                <CardHeader
                  icon={GitBranch}
                  title="Distribution"
                  subtitle="Choose the error distribution and link function."
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Family
                    </label>
                    <SelectDropdown
                      value={family}
                      onChange={(v) => handleFamilyChange(v as Family)}
                      placeholder="Select family"
                      options={FAMILY_OPTIONS.map((f) => ({
                        value: f.value,
                        label: f.label,
                        description: f.description,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Link{" "}
                      {canonicalLink && effectiveLink === canonicalLink && (
                        <span className="font-normal normal-case tracking-normal text-muted-foreground/40">
                          (canonical)
                        </span>
                      )}
                    </label>
                    <SelectDropdown
                      value={effectiveLink}
                      onChange={(v) => setLink(v === canonicalLink ? null : (v as Link))}
                      placeholder="Select family first"
                      options={LINK_OPTIONS.map((l) => ({
                        value: l.value,
                        label: l.label,
                      }))}
                    />
                  </div>
                </div>
              </GlassCard>
            </AnimatedSection>

            {/* Offset & Weights */}
            <AnimatedSection delay={0.25} zIndex={20}>
              <GlassCard>
                <CardHeader
                  icon={Weight}
                  title="Offset & Weights"
                  subtitle="Optional. Offset is a fixed term in the linear predictor (e.g. log-exposure)."
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Offset
                    </label>
                    <SelectDropdown
                      value={offset}
                      onChange={setOffset}
                      placeholder="None"
                      allowNone
                      options={numericCols
                        .filter((c) => c.name !== response)
                        .map((c) => ({ value: c.name, label: c.name }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Weights
                    </label>
                    <SelectDropdown
                      value={weights}
                      onChange={setWeights}
                      placeholder="None"
                      allowNone
                      options={numericCols
                        .filter((c) => c.name !== response)
                        .map((c) => ({ value: c.name, label: c.name }))}
                    />
                  </div>
                </div>
              </GlassCard>
            </AnimatedSection>

            {/* Data Split */}
            <AnimatedSection delay={0.35} zIndex={15}>
              <GlassCard>
                <CardHeader
                  icon={Layers}
                  title="Data Split"
                  subtitle="Optional. Choose a column that identifies train / validation / holdout groups."
                />
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Split Column
                    </label>
                    <SelectDropdown
                      value={splitColumn}
                      onChange={(v) => setSplitColumn(v)}
                      placeholder="None"
                      allowNone
                      options={columns
                        .filter((c) => c.name !== response && c.n_unique <= 20)
                        .map((c) => ({ value: c.name, label: c.name, badge: `${c.n_unique} values` }))}
                    />
                  </div>

                  {splitColumn && splitValues.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Assign Values
                      </label>
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] divide-y divide-white/[0.04]">
                        {splitValues.map((val) => (
                          <div key={val} className="flex items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{val}</span>
                            <div className="flex gap-1">
                              {(["train", "validation", "holdout"] as const).map((group) => (
                                <button
                                  key={group}
                                  onClick={() =>
                                    setSplitMapping((prev) => ({
                                      ...prev,
                                      [val]: prev[val] === group ? null : group,
                                    }))
                                  }
                                  className={cn(
                                    "rounded-md px-2.5 py-1 text-[0.65rem] font-medium transition-all",
                                    splitMapping[val] === group
                                      ? group === "train"
                                        ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
                                        : group === "validation"
                                          ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
                                          : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30"
                                      : "bg-white/[0.03] text-muted-foreground/40 hover:bg-white/[0.06] hover:text-muted-foreground/60"
                                  )}
                                >
                                  {group.charAt(0).toUpperCase() + group.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {splitColumn && loadingValues && (
                    <p className="text-xs text-muted-foreground/50 animate-pulse">Loading values…</p>
                  )}
                </div>
              </GlassCard>
            </AnimatedSection>

            {/* Continue button */}
            <AnimatedSection delay={0.45} zIndex={10}>
              <div className="group relative pt-2">
                {/* Glow behind button when valid */}
                {isValid && (
                  <div
                    className="absolute inset-x-0 -bottom-2 mx-auto h-16 w-3/4 rounded-full bg-primary/20 blur-2xl transition-opacity"
                  />
                )}
                <button
                  disabled={!isValid}
                  onClick={handleContinue}
                  className={cn(
                    "relative flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-300",
                    isValid
                      ? "bg-primary text-primary-foreground shadow-[0_0_24px_-4px_#3b82f640] hover:-translate-y-0.5 hover:shadow-[0_0_32px_-4px_#3b82f660]"
                      : "cursor-not-allowed bg-white/[0.04] text-muted-foreground/40"
                  )}
                >
                  Continue to Model Builder
                  <ArrowRight className={cn(
                    "h-4 w-4 transition-transform",
                    isValid && "group-hover:translate-x-0.5"
                  )} />
                </button>
                {!isValid && (
                  <p className="mt-3 text-center text-xs text-muted-foreground/40">
                    Select a response variable to continue
                  </p>
                )}
              </div>
            </AnimatedSection>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Reusable sub-components ---- */

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]">
      {children}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>
      </div>
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
}

function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowNone = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260) {
        setPos({ left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 });
      } else {
        setPos({ left: rect.left, width: rect.width, top: rect.bottom + 6 });
      }
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all",
          open
            ? "border-primary/30 bg-white/[0.04] shadow-[0_0_0_1px_#3b82f620]"
            : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground/40"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[1000] max-h-60 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#111113] p-1 shadow-2xl shadow-black/50"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              animation: "fadeUp 0.15s ease-out both",
            }}
          >
            {allowNone && (
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                None
              </button>
            )}
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-all",
                  opt.value === value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.badge && (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground/60">
                    {opt.badge}
                  </span>
                )}
                {opt.description && (
                  <span className="text-[0.65rem] text-muted-foreground/40">{opt.description}</span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
