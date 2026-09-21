import { describe, it, expect, vi } from "vitest";
import {
  setupWidgetTests,
  widget,
  response,
  answer,
  key,
  action,
} from "./helpers.js";
setupWidgetTests();
const commands = [
  {
    key: "reports",
    group: "Navigation",
    description: "Open reports",
    aliases: ["analytics"],
    examples: ["show reports"],
  },
  {
    key: "users",
    group: "Navigation",
    description: "Open users",
    examples: [],
  },
  {
    key: "settings",
    group: "Workspace",
    description: "Settings",
    examples: ["preferences"],
  },
];

describe("command help and suggestions", () => {
  it("loads the server catalog and builds live page commands", async () => {
    const w = widget(
      '<input id="name" aria-label="Name"><h2>Billing</h2><button>Save</button>',
    );
    document.querySelector("#name").focus();
    fetch.mockResolvedValueOnce(response({ commands }));
    w.shadowRoot.querySelector(".help-toggle").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls[0][0]).toBe("/voice_control/commands?path=%2Faccount");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    expect(w.help.textContent).toContain("Open reports");
    expect(w.help.textContent).toContain("Enter into selected field (Name)");
    expect(w.help.textContent).toContain("Clear selected field (Name)");
    expect(w.help.textContent).toContain("Show Billing section");
    expect(w.help.textContent).toContain("Submit active form");
    expect(w.help.textContent).toContain("Go forward");
    document.querySelector("#name").remove();
    document.dispatchEvent(new Event("turbo:load"));
    await vi.advanceTimersByTimeAsync(100);
    expect(w.help.textContent).not.toContain("Fill Name");
    expect(w.selectedField).toBeNull();
    await w.toggleHelp();
    expect(w.help.hidden).toBe(true);
  });
  it("searches aliases, examples, accents, and small spelling errors", async () => {
    const w = widget("", { browserActions: "false" });
    fetch.mockResolvedValueOnce(response({ commands }));
    await w.toggleHelp();
    const search = w.shadowRoot.querySelector("#search");
    for (const query of [
      "analytcis",
      "réports",
      "reprots",
      "report",
      "show reports",
    ]) {
      search.value = query;
      search.dispatchEvent(new Event("input"));
      expect(w.help.querySelectorAll("button")).toHaveLength(1);
      expect(w.help.textContent).toContain("Open reports");
    }
    search.value = "nonexistent document";
    search.dispatchEvent(new Event("input"));
    expect(w.help.textContent).toContain("No matching commands");
    key(search, "ArrowDown");
    expect(w.shadowRoot.activeElement).toBe(search);
  });
  it("navigates help with arrows, preserves focus, and runs the selected command", async () => {
    const w = widget("", { browserActions: "false" });
    fetch.mockResolvedValueOnce(response({ commands }));
    await w.toggleHelp();
    const search = w.shadowRoot.querySelector("#search");
    key(search, "ArrowDown");
    expect(w.shadowRoot.activeElement.textContent).toBe("Open reports");
    w.renderCatalog();
    expect(w.shadowRoot.activeElement.textContent).toBe("Open reports");
    key(w.shadowRoot.activeElement, "ArrowUp");
    expect(w.shadowRoot.activeElement).toBe(search);
    key(search, "ArrowUp");
    expect(w.shadowRoot.activeElement.textContent).toBe("Settings");
    key(w.shadowRoot.activeElement, "ArrowDown");
    expect(w.shadowRoot.activeElement.textContent).toBe("Open reports");
    w.catalog = commands.slice(1);
    w.renderCatalog();
    expect(w.shadowRoot.activeElement).toBe(search);
    answer({ kind: "message", message: "Opened" });
    key(search, "Enter");
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(fetch.mock.calls[1][1].body).command).toBe("users");
    expect(w.help.hidden).toBe(true);
    expect(w.status.textContent).toBe("Opened");
  });
  it("keeps page help usable when the catalog request fails", async () => {
    const w = widget("<button>Save</button>");
    fetch.mockRejectedValueOnce(new Error("Offline"));
    await w.toggleHelp();
    expect(w.status.textContent).toBe("Offline");
    expect(w.help.textContent).toContain("Click Save");
    document.body.insertAdjacentHTML(
      "afterbegin",
      "<button>Another</button>".repeat(201),
    );
    w.renderCatalog();
    expect(w.status.textContent).toContain("too many controls");
  });
  it("prioritizes selected fields and save buttons without suggesting destructive actions", async () => {
    const w = widget(
      '<nav><button>Menu</button></nav><form><input id="name" aria-label="Name"><select aria-label="Plan"><option>Free</option></select><button>Save</button><button type="button">Delete</button></form>',
    );
    const field = document.querySelector("#name");
    field.focus();
    await vi.advanceTimersByTimeAsync(100);
    const suggestions = w.shadowRoot.querySelector(".suggestions");
    expect(
      [...suggestions.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Enter Name", "Select Plan", "Click Save"]);
    expect(w.shadowRoot.querySelector(".selected-field").textContent).toBe(
      "Editing: Name",
    );
    fetch.mockResolvedValueOnce(
      response({
        kind: "question",
        message: "What value?",
        continuation: "name",
      }),
    );
    suggestions.querySelector("button").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(fetch.mock.calls[0][1].body).command).toMatch(
      /^voice_control_browser_enter_e\d+$/,
    );
    expect(suggestions.hidden).toBe(true);
  });
  it("suggests safe navigation when the page has no editable fields", () => {
    const w = widget(
      '<button>Delete</button><a href="/users">Users</a><button>Menu</button><button>Logout</button>',
    );
    w.refreshPageTools();
    expect(w.shadowRoot.querySelector(".suggestions").textContent).toBe(
      "Click UsersClick Menu",
    );
  });
  it("refreshes page tools after input, change, frame navigation and DOM mutations", async () => {
    const w = widget('<input id="name" aria-label="Name">');
    const field = document.querySelector("#name");
    field.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(w.selectedField.node).toBe(field);
    w.runBrowserAction(action(w, "#name", "fill", { value: "Alice" }));
    field.value = "Bob";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    expect(w.undoEdit).toBeNull();
    field.setAttribute("aria-label", "Workspace");
    document.dispatchEvent(new Event("turbo:frame-load"));
    window.dispatchEvent(new Event("hashchange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(w.shadowRoot.querySelector(".selected-field").textContent).toBe(
      "Editing: Workspace",
    );
    w.close();
    field.remove();
    await vi.advanceTimersByTimeAsync(100);
    expect(w.panel.hidden).toBe(true);
  });
});
