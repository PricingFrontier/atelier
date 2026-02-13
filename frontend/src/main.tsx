import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { log } from "@/lib/logger";
import "./index.css";
import App from "./App.tsx";

log.info("main", "Atelier frontend initialising");

window.addEventListener("error", (event) => {
  log.error("GLOBAL", `Uncaught error: ${event.message}`, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.stack ?? event.error,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  log.error("GLOBAL", `Unhandled promise rejection: ${event.reason}`, {
    reason: event.reason?.stack ?? event.reason,
  });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
