import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
