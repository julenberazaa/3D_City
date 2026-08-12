import { cpSync, existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "copy-fixtures-to-dist",
      apply: "build",
      closeBundle() {
        if (existsSync("fixtures")) cpSync("fixtures", "dist/fixtures", { recursive: true });
      },
    },
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  worker: {
    format: "es",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Heavy generators (full-fixture buildWorld) + rapier stepping can exceed
    // 30s on loaded machines; 60s keeps gates deterministic under contention.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
