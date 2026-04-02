import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lojacelular/shared": path.resolve(
        __dirname,
        "../../packages/shared/src/index.ts"
      )
    }
  },
  server: {
    host: process.env.WEB_HOST ?? "0.0.0.0",
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});
