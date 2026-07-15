import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests target the deterministic `src/lib` layer (simulator rules, traffic
 * and tournament models, dispatch store, weather client). These are pure and
 * network-free by design, so a `node` environment with no DOM is all we need.
 * The `@/` alias mirrors tsconfig so tests import exactly what the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/shared/**"],
      reporter: ["text", "html"],
    },
  },
});
