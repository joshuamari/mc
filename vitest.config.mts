import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // A direct `vitest` import loads a second runner in Vite's module runner and
    // crashes `describe()` on this machine. Tests use the injected globals instead.
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
