import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    typecheck: { tsconfig: "./tsconfig.test.json" },
    server: { deps: { inline: ["convex-test"] } }
  }
});
