import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

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

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/new" element={<ModelConfigPage />} />
        <Route path="/model" element={<ModelBuilderPage />} />
      </Routes>
    </Suspense>
  );
}
