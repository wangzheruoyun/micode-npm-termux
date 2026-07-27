import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});