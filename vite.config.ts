import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 3002,
  },
  build: {
    outDir: "dist",
  },
});
