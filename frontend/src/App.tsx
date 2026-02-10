import { Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import ModelConfigPage from "@/pages/ModelConfigPage";
import ModelBuilderPage from "@/pages/ModelBuilderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/new" element={<ModelConfigPage />} />
      <Route path="/model" element={<ModelBuilderPage />} />
    </Routes>
  );
}
