import { lazy, Suspense, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { log } from "@/lib/logger";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const ModelConfigPage = lazy(() => import("@/pages/ModelConfigPage"));
const ModelBuilderPage = lazy(() => import("@/pages/ModelBuilderPage"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("ErrorBoundary", `Unhandled React error: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
          <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
          <pre className="max-w-2xl overflow-auto rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground">
            {this.state.error.message}\n{this.state.error.stack}
          </pre>
          <p className="text-xs text-muted-foreground">Check the browser console for full details.</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Return Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  log.info("App", "render");
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/new" element={<ModelConfigPage />} />
          <Route path="/model" element={<ModelBuilderPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
