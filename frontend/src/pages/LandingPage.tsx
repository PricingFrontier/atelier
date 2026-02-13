import { useNavigate } from "react-router-dom";
import { Plus, Clock, GitBranch, ArrowRight, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import { log } from "@/lib/logger";
import PageBackground from "@/components/ui/PageBackground";
import type { ProjectSummary } from "@/types";

const TAG = "LandingPage";

export default function LandingPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  log.info(TAG, "render");

  useEffect(() => {
    log.info(TAG, "mount — fetching projects");
    apiGet<ProjectSummary[]>("/projects")
      .then((data) => {
        log.info(TAG, `fetched ${data.length} projects`, data.map((p) => ({ id: p.id, name: p.name })));
        setProjects(data);
      })
      .catch((err) => log.error(TAG, "fetch projects FAILED", err));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") navigate("/new");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const handleLoadProject = async (p: ProjectSummary) => {
    log.info(TAG, `loadProject id=${p.id} name="${p.name}"`);
    try {
      const detail = await apiGet<any>(`/projects/${p.id}`);
      const cfg = detail.config;
      if (!cfg) {
        log.warn(TAG, `project ${p.id} has no config — aborting load`);
        return;
      }
      log.info(TAG, `project config loaded — response=${cfg.response} family=${cfg.family} cols=${(cfg.columns ?? []).length}`);

      // Pass basic config — builder will fetch terms + fit result on mount
      navigate("/model", {
        state: {
          projectId: p.id,
          projectName: p.name,
          response: cfg.response ?? "",
          family: cfg.family ?? "poisson",
          link: cfg.link ?? null,
          offset: cfg.offset ?? null,
          weights: cfg.weights ?? null,
          columns: cfg.columns ?? [],
          datasetPath: cfg.dataset_path ?? null,
          split: cfg.split ?? null,
        },
      });
      log.info(TAG, `navigated to /model for project ${p.id}`);
    } catch (err) {
      log.error(TAG, `loadProject FAILED for id=${p.id}`, err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    log.info(TAG, `deleteProject id=${id}`);
    try {
      await apiDelete(`/projects/${id}`);
      log.info(TAG, `deleted project ${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      log.error(TAG, `deleteProject FAILED for id=${id}`, err);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <PageBackground
        gridOpacity={0.15}
        gridMask="radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 100%)"
      />

      {/* Content */}
      <div className="relative z-10 text-center">
        <h1
          className="bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-[4rem] font-extralight uppercase tracking-[0.3em] text-transparent"
          style={{ animation: "fadeUp 1s ease-out both" }}
        >
          Atelier
        </h1>
        <p className="animate-[fadeUp_0.8s_ease-out_0.2s_both] text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Generalized Linear Model Workbench
        </p>

        <div className="mt-14 flex justify-center gap-3.5 animate-[fadeUp_0.8s_ease-out_0.4s_both]">
          <button
            onClick={() => navigate("/new")}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-[0.625rem] border border-border bg-card px-6 py-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:text-foreground hover:bg-surface-active"
          >
            <Plus className="h-[18px] w-[18px] opacity-50 transition-opacity group-hover:opacity-80" />
            New Model
            <kbd className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[0.65rem] font-normal text-muted-foreground/60 border border-border transition-colors group-hover:text-muted-foreground">
              N
            </kbd>
          </button>
        </div>

        {/* Saved projects */}
        {projects.length > 0 && (
          <div className="mt-10 animate-[fadeUp_0.8s_ease-out_0.6s_both]">
            <p className="mb-4 text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground/60">
              Recent Projects
            </p>
            <div className="flex flex-col items-center gap-2">
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => handleLoadProject(p)}
                  className="group flex w-[400px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-border hover:bg-surface-hover"
                  style={{ animation: `fadeUp 0.4s ease-out ${0.7 + i * 0.08}s both` }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium text-foreground/80 group-hover:text-foreground">
                      {p.name}
                    </p>
                    <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground/60">
                      {p.response && <span>{p.response}</span>}
                      {p.family && <span>· {p.family}</span>}
                      <span>· {p.n_versions} version{p.n_versions !== 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(p.id);
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    title="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-6 p-5 animate-[fadeIn_0.8s_ease-out_0.8s_both]">
        <span className="text-[0.7rem] tracking-wider text-muted-foreground/60">
          Powered by <span className="font-medium text-muted-foreground">Pricing Frontier</span>
        </span>
      </div>
    </div>
  );
}
