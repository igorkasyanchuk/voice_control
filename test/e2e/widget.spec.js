import { test, expect } from "@playwright/test";

test("the browser regression fixture passes", async ({ page }) => {
  await page.goto("/test/browser/index.html");
  await expect(page.locator("#summary")).toHaveText("14/14 passed; 0 failures");
});

async function installSpeech(page) {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        if (this.active) throw new DOMException("already running", "InvalidStateError");
        this.active = true;
        window.fixtureRecognition = this;
      }
      abort() {
        setTimeout(() => { this.active = false; this.onend?.(); }, 0);
      }
      stop() { this.abort(); }
    };
  });
}
async function say(page, text) {
  await expect.poll(() => page.evaluate(() => !!window.fixtureRecognition?.active)).toBe(true);
  await page.evaluate((text) => {
    const result = [{ transcript: text }];
    result.isFinal = true;
    window.fixtureRecognition.onresult({ resultIndex: 0, results: [result] });
  }, text);
}
async function commandRoutes(page) {
  await page.route("**/voice_control/interpret", (route) => route.fulfill({ json: { kind: "execute", ticket: route.request().postDataJSON().transcript } }));
  await page.route("**/voice_control/execute", (route) => {
    const command = route.request().postDataJSON().ticket;
    return route.fulfill({ json: command === "open users"
      ? { kind: "navigate", url: "/users" }
      : command === "change plan"
        ? { kind: "reload", notification: "Plan updated." }
        : { kind: "message", message: "Next command completed." } });
  });
}

test("listening survives Turbo navigation, another command, and a full reload", async ({ page }) => {
  await installSpeech(page);
  await commandRoutes(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open Voice Control", exact: true }).click();
  await say(page, "open users");
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("button", { name: "Stop microphone", exact: true })).toBeVisible();
  await say(page, "next command");
  await expect(page.locator(".status")).toHaveText("Next command completed.");
  await say(page, "change plan");
  await expect(page.locator(".notification")).toBeVisible();
  await expect(page.locator(".notification")).toHaveText("Plan updated.");
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("navigation")[0].type)).toBe("reload");
  await expect(page.getByRole("button", { name: "Stop microphone", exact: true })).toBeVisible();
  await say(page, "after reload");
  await expect(page.locator(".status")).toHaveText("Next command completed.");
  await page.getByRole("button", { name: "Close and stop listening" }).click();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Voice Control commands" })).toBeHidden();
});

test("execution timeout is bounded, not retried, and has no success notice", async ({ page }) => {
  let executions = 0;
  await page.route("**/voice_control/interpret", (route) => route.fulfill({ json: { kind: "execute", ticket: "once" } }));
  await page.route("**/voice_control/execute", () => { executions++; });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Voice Control", exact: true }).click();
  await page.getByRole("textbox", { name: "Your command" }).fill("change plan");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(page.locator(".status")).toContainText("may already have completed");
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeEnabled();
  await expect(page.locator(".notification")).toBeHidden();
  expect(executions).toBe(1);
});

test("an optional completion notice leaves the current page and form intact", async ({ page }) => {
  await page.route("**/voice_control/interpret", (route) => route.fulfill({ json: { kind: "execute", ticket: "saved" } }));
  await page.route("**/voice_control/execute", (route) => route.fulfill({ json: { kind: "event", name: "account:saved", detail: { saved: true }, notification: "Account saved." } }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Unsaved draft");
  await page.evaluate(() => {
    window.addEventListener("account:saved", (event) => { window.savedEvent = event.detail; });
  });
  await page.getByRole("button", { name: "Open Voice Control", exact: true }).click();
  await page.getByRole("textbox", { name: "Your command" }).fill("save account");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(page.locator(".notification")).toHaveText("Account saved.");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Unsaved draft");
  expect(await page.evaluate(() => window.savedEvent)).toEqual({ saved: true });
  await expect(page).toHaveURL("/");
});

test("page policies refresh help through Turbo and never send excluded controls", async ({ page }) => {
  await page.route("**/voice_control/commands?*", (route) => {
    const path = new URL(route.request().url()).searchParams.get("path");
    return route.fulfill({ json: { commands: [{ key: "scoped", description: path === "/users" ? "Manage users" : "Account info", group: "Commands", examples: [] }] } });
  });
  let manifest;
  await page.route("**/voice_control/interpret", (route) => {
    manifest = route.request().postDataJSON().browser_page;
    return route.fulfill({ json: { kind: "message", message: "Checked" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Voice Control", exact: true }).click();
  await page.getByRole("button", { name: "Show all commands" }).click();
  await expect(page.locator(".catalog")).toContainText("Account info");
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await expect(page.locator(".catalog")).toContainText("Manage users");
  await expect(page.locator(".catalog")).not.toContainText("Account info");
  await page.evaluate(() => document.querySelector("form").setAttribute("data-voice-control-ignore", ""));
  await expect(page.locator(".catalog")).not.toContainText("Fill Name");
  await page.evaluate(() => {
    const meta = document.createElement("meta");
    meta.name = "voice-control-browser-actions";
    meta.content = "off";
    meta.setAttribute("data-turbo-temporary", "");
    document.head.append(meta);
  });
  await expect(page.locator(".catalog")).not.toContainText("On this page");
  await expect(page.locator(".catalog")).toContainText("Manage users");
  await page.getByRole("textbox", { name: "Your command" }).fill("manage users");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(page.locator(".status")).toHaveText("Checked");
  expect(manifest).toBeUndefined();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".catalog")).toContainText("Click Save user");
});
