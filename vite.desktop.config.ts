import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "desktop"),
  publicDir: resolve(projectRoot, "public"),
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: resolve(projectRoot, "dist-desktop"),
    emptyOutDir: true,
  },
});
