import { it, expect, vi } from "vitest";
import { setupWidgetTests, widget, action, response, answer } from "./helpers.js";
setupWidgetTests();

function disablePage() {
  const meta = document.createElement("meta");
  meta.name = "voice-control-browser-actions";
  meta.content = "off";
  document.head.append(meta);
  return meta;
}

it("omits all dynamic commands on an opted-out page while Ruby commands still work", async () => {
  disablePage();
  const w = widget('<button>Save</button>');
  fetch.mockResolvedValueOnce(response({ commands: [{ key: "account", description: "Account details", examples: [] }] }));
  await w.toggleHelp();
  expect(w.help.textContent).toContain("Account details");
  expect(w.help.textContent).not.toContain("Click Save");
  expect(w.help.textContent).not.toContain("Submit active form");
  answer({ kind: "message", message: "Saved", notification: "Account saved." });
  await w.submit("account");
  expect(JSON.parse(fetch.mock.calls.at(-2)[1].body)).not.toHaveProperty("browser_page");
  expect(w.shadowRoot.querySelector(".notification").textContent).toBe("Account saved.");
});

it("rechecks live page opt-outs before any pending dynamic result can execute", async () => {
  const w = widget('<form><input aria-label="Name"><button>Save</button></form>');
  const click = action(w, "button", "click");
  const clicked = vi.fn();
  document.querySelector("button").addEventListener("click", clicked);
  const meta = disablePage();
  for (const result of [click, { ...click, action: "submit" }, { ...click, action: "scroll", direction: "top" }, { ...click, action: "history", direction: "back" }]) {
    expect(() => w.runBrowserAction(result)).toThrow();
  }
  expect(clicked).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100);
  expect(w.shadowRoot.querySelector(".suggestions").hidden).toBe(true);
  meta.content = "on";
  await vi.advanceTimersByTimeAsync(100);
  expect(w.shadowRoot.querySelector(".suggestions").hidden).toBe(false);
});

it("excludes ignored subtrees and externally associated controls of ignored forms", () => {
  const w = widget('<section data-voice-control-ignore><button>Delete</button></section><form id="secret" data-voice-control-ignore></form><input form="secret" aria-label="Secret"><input aria-label="Public">');
  expect(w.discoverBrowserControls().page.elements.map((e) => e.label)).toEqual(["Public"]);
  const pending = action(w, 'input[aria-label="Public"]', "fill", { value: "Changed" });
  document.querySelector('input[aria-label="Public"]').setAttribute("data-voice-control-ignore", "");
  expect(() => w.runBrowserAction(pending)).toThrow();
  expect(document.querySelector('input[aria-label="Public"]').value).toBe("");
});

it("refreshes scoped help after navigation even without browser actions and discards stale responses", async () => {
  const w = widget("", { browserActions: "false" });
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const loading = w.toggleHelp();
  window.history.pushState({}, "", "/users");
  fetch.mockResolvedValueOnce(response({ commands: [{ key: "user", description: "User command", examples: [] }] }));
  document.dispatchEvent(new Event("turbo:load"));
  await vi.advanceTimersByTimeAsync(100);
  expect(fetch.mock.calls.at(-1)[0]).toContain("path=%2Fusers");
  expect(w.help.textContent).toContain("User command");
  window.VoiceControl.refresh();
  resolveOld(response({ commands: [{ key: "old", description: "Old account command", examples: [] }] }));
  await loading;
  expect(w.help.textContent).not.toContain("Old account command");
  expect(w.help.textContent).toContain("User command");
});

it("does not execute an interpreted command after the user navigates away", async () => {
  const w = widget();
  let resolve;
  fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const pending = w.submit("save account");
  window.history.pushState({}, "", "/users");
  resolve(response({ kind: "execute", ticket: "old-page" }));
  await pending;
  expect(fetch).toHaveBeenCalledOnce();
});

it("rejects a link whose navigation behavior changes while a command is pending", () => {
  const w = widget('<a href="/users">Users</a>');
  const pending = action(w, "a", "click");
  document.querySelector("a").setAttribute("target", "_blank");
  expect(() => w.runBrowserAction(pending)).toThrow("control changed");
});

it("does not apply a completed action to a different page or show a success notice there", async () => {
  const w = widget();
  fetch.mockResolvedValueOnce(response({ kind: "execute", ticket: "pending" }));
  let resolve;
  fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const pending = w.submit("save account");
  await vi.advanceTimersByTimeAsync(0);
  window.history.pushState({}, "", "/users");
  resolve(response({ kind: "message", notification: "Saved old account" }));
  await pending;
  expect(w.shadowRoot.querySelector(".notification").hidden).toBe(true);
  expect(w.status.textContent).toContain("Check the action's result");
});
