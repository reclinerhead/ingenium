import { defineConfig } from "vitest/config";

// One root run over every workspace package. A package joins by having tests;
// give it its own vitest.config.ts only when it needs a different environment.
export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
