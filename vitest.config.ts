import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Next.js enforces this marker at application-build time; Vitest runs server modules directly.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/server-only-mock.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
