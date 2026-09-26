import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files serially
    fileParallelism: false,
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 30000,
  },
});
