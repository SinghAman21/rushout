import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "rushout-shared": fileURLToPath(new URL("../shared/src/browser.ts", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["colyseus.js", "@colyseus/schema"],
  },
  server: {
    port: 3000,
  },
});
