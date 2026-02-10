import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen } from "lucide-react";
import { useEffect } from "react";

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" || e.key === "N") navigate("/new");
      if (e.key === "l" || e.key === "L") navigate("/load");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Noise overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-15"
        style={{
          backgroundImage:
            "linear-gradient(#1e1e22 1px, transparent 1px), linear-gradient(90deg, #1e1e22 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 100%)",
        }}
      />

      {/* Aurora blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[30%] left-[20%] h-[600px] w-[600px] animate-[auroraFloat1_12s_ease-in-out_infinite] rounded-full bg-blue-500 opacity-[0.07] blur-[120px]" />
        <div className="absolute top-[40%] right-[15%] h-[500px] w-[500px] animate-[auroraFloat2_14s_ease-in-out_infinite] rounded-full bg-violet-500 opacity-[0.07] blur-[120px]" />
        <div className="absolute bottom-[20%] left-[40%] h-[400px] w-[400px] animate-[auroraFloat3_10s_ease-in-out_infinite] rounded-full bg-cyan-500 opacity-[0.07] blur-[120px]" />
      </div>

      {/* Chart decoration */}
      <div className="pointer-events-none fixed bottom-0 left-0 w-full animate-[fadeIn_1.5s_ease-out_1s_both]">
        <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="h-[200px] w-full">
          <path
            className="animate-[drawLine_3s_ease-out_1.2s_both]"
            d="M0,180 C120,170 240,140 360,120 C480,100 520,90 600,85 C720,75 800,80 840,95 C920,110 960,100 1020,70 C1100,40 1200,50 1300,45 C1380,42 1420,55 1440,60"
            fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.15"
            style={{ strokeDasharray: 1200, strokeDashoffset: 1200 }}
          />
          <path
            className="animate-[drawLine_3s_ease-out_1.5s_both]"
            d="M0,190 C160,185 280,160 400,145 C520,130 580,120 680,110 C780,100 840,115 920,125 C1000,135 1080,110 1180,80 C1280,50 1360,65 1440,70"
            fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" opacity="0.1"
            style={{ strokeDasharray: 1200, strokeDashoffset: 1200 }}
          />
          <path
            className="animate-[drawLine_3s_ease-out_1.8s_both]"
            d="M0,185 C200,175 320,150 440,135 C560,120 640,130 740,125 C840,120 920,105 1040,90 C1160,75 1260,85 1360,75 C1420,70 1440,80 1440,80"
            fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.08"
            style={{ strokeDasharray: 1200, strokeDashoffset: 1200 }}
          />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center">
        <h1
          className="bg-gradient-to-br from-white via-zinc-400 to-white bg-[length:200%_200%] bg-clip-text text-[4rem] font-extralight uppercase tracking-[0.3em] text-transparent"
          style={{ animation: "fadeUp 1s ease-out both, shimmer 8s ease-in-out infinite" }}
        >
          Atelier
        </h1>
        <p className="animate-[fadeUp_0.8s_ease-out_0.2s_both] text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Generalized Linear Model Workbench
        </p>

        <div className="mt-14 flex justify-center gap-3.5 animate-[fadeUp_0.8s_ease-out_0.4s_both]">
          <button
            onClick={() => navigate("/new")}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-[0.625rem] border border-border bg-gradient-to-br from-[#151517] to-[#0f0f11] px-6 py-3 text-sm font-medium text-zinc-400 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#2e2e33] hover:text-white hover:shadow-[0_0_0_1px_#2e2e33,0_4px_24px_-4px_#3b82f610,0_0_48px_-12px_#3b82f608]"
          >
            <Plus className="h-[18px] w-[18px] opacity-50 transition-opacity group-hover:opacity-80" />
            New Model
            <kbd className="ml-1 rounded bg-[#1e1e22] px-1.5 py-0.5 text-[0.65rem] font-normal text-zinc-600 border border-[#2a2a2e] transition-colors group-hover:text-zinc-500">
              N
            </kbd>
          </button>
          <button
            onClick={() => navigate("/load")}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-[0.625rem] border border-border bg-gradient-to-br from-[#151517] to-[#0f0f11] px-6 py-3 text-sm font-medium text-zinc-400 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#2e2e33] hover:text-white hover:shadow-[0_0_0_1px_#2e2e33,0_4px_24px_-4px_#3b82f610,0_0_48px_-12px_#3b82f608]"
          >
            <FolderOpen className="h-[18px] w-[18px] opacity-50 transition-opacity group-hover:opacity-80" />
            Load Model
            <kbd className="ml-1 rounded bg-[#1e1e22] px-1.5 py-0.5 text-[0.65rem] font-normal text-zinc-600 border border-[#2a2a2e] transition-colors group-hover:text-zinc-500">
              L
            </kbd>
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-6 p-5 animate-[fadeIn_0.8s_ease-out_0.8s_both]">
        <span className="text-[0.7rem] tracking-wider text-zinc-600">
          Powered by <span className="font-medium text-zinc-500">Pricing Frontier</span>
        </span>
      </div>
    </div>
  );
}
