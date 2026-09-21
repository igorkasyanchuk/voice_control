import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 20000,
  retries: 0,
  workers: 3,
  use: { baseURL: "http://127.0.0.1:4217", trace: "retain-on-failure" },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: ["chromium", "firefox", "webkit"].map((browserName) => ({ name: browserName, use: { browserName } })),
  webServer: {
    command: "node test/e2e/server.mjs",
    url: "http://127.0.0.1:4217/test/browser/index.html",
    reuseExistingServer: false,
  },
});
