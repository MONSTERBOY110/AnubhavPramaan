import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Evaluation runs (eval/**/*.eval.ts) are kept out of the unit suite: they may call live models
// and take minutes. Run them on purpose, for example:
//   AP_EVAL_MODE=keyword AP_EVAL_SET=frozen npx vitest run --config vitest.eval.config.mts
export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    testTimeout: 3 * 60 * 60 * 1000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
});
