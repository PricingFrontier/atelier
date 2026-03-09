import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8457",
      "/ws": {
        target: "ws://localhost:8457",
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../src/atelier/static"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/recharts-scale")) {
            return "recharts";
          }
          if (id.includes("node_modules/d3-")) {
            return "d3";
          }
        },
      },
    },
  },
});
