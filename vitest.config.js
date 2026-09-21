import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/account?tab=plan" } },
    include: ["test/javascript/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["assets/**/*.js"],
      reporter: ["text", "html", "json", "json-summary"],
      reportsDirectory: "coverage/javascript",
      thresholds: {
        lines: 95.01,
        statements: 95.01,
        functions: 95.01,
        branches: 95.01,
      },
    },
  },
});
