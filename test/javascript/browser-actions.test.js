import { describe, it, expect, vi } from "vitest";
import { setupWidgetTests, widget, action } from "./helpers.js";
setupWidgetTests();

describe("page discovery", () => {
  it("requires readable labels and omits unsafe or unavailable controls", () => {
    const w = widget(`
      <a href="/users">Users ↗</a><a href="/users">USERS</a><a href="/other">Users</a>
      <a href="https://outside.test">Outside</a><button disabled>Disabled</button>
      <button hidden>Hidden</button><div inert><button>Inert</button></div>
      <button aria-disabled="true">Unavailable</button><input type="password" aria-label="Password">
      <button id="technical"><svg><title>Not a label</title></svg></button>
      <button aria-label="Menu"><span class="material-icons">menu</span></button>
      <label for="name">Name <input value="private"></label><input id="name" value="secret">
      <span id="extra">Workspace</span><button aria-labelledby="extra">Open</button>
      <button><img alt="Picture" src="/image.png"></button><input type="submit" value="Save">
      <input placeholder="Search"><textarea title="Note"></textarea><input type="hidden" aria-label="Hidden input">
      <div role="button" data-voice-control-label="Special">Ignored text</div><h2>Billing</h2>
      <input readonly aria-label="Read only"><textarea readonly aria-label="Locked"></textarea>
      <button style="visibility:hidden">Invisible</button><button style="display:none">No layout</button>
      <section data-voice-control-ignore><button>Ignored</button></section>
    `);
    const labels = w
      .discoverBrowserControls()
      .page.elements.map((e) => e.label);
    expect(labels).toEqual([
      "Users",
      "Users",
      "Menu",
      "Name",
      "Workspace",
      "Picture",
      "Save",
      "Search",
      "Note",
      "Special",
      "Billing",
    ]);
    expect(JSON.stringify(w.discoverBrowserControls().page)).not.toContain(
      "secret",
    );
  });
  it("adds row identity to generic actions without exposing email addresses", () => {
    const w = widget(`<table><tbody>
      <tr><td><strong>Alice</strong><small>Private detail</small></td><td><button>Edit</button></td></tr>
      <tr><td>private@example.com</td><td><button>Edit</button></td></tr>
      <tr><td>Open</td><td><button>Open</button></td></tr>
    </tbody></table>`);
    expect(
      w.discoverBrowserControls().page.elements.map((e) => e.label),
    ).toEqual(["Edit Alice", "Edit", "Open"]);
  });
  it("keeps distinct link behavior and deduplicates before the page limit", () => {
    const w = widget(
      `${'<a href="/users">Users</a>'.repeat(201)}<a href="/users" target="_blank">Users</a><a href="/users?active=1">Users</a><a href="/users" download>Users</a><button>Users</button><button>Users</button>`,
    );
    expect(w.discoverBrowserControls().page.elements).toHaveLength(6);
    document.body.insertAdjacentHTML(
      "afterbegin",
      "<button>Another</button>".repeat(201),
    );
    expect(() => w.discoverBrowserControls()).toThrow("too many controls");
    w.refreshPageTools();
    expect(w.status.textContent).toContain("too many controls");
  });
  it("filters dropdown options and bounds their count and payload", () => {
    const w = widget(`<select id="plan" aria-label="Plan">
      <option value="f">Free</option><option disabled>Disabled</option><optgroup disabled><option>Hidden</option></optgroup>
      <option aria-disabled="true">Unavailable</option><option hidden>Secret</option><option>🚀</option>
      </select><select multiple aria-label="Many"><option>One</option></select><select aria-label="Empty"></select>`);
    const plan = document.querySelector("#plan");
    expect(w.discoverBrowserControls().page.elements).toHaveLength(1);
    expect(
      w.discoverBrowserControls().page.elements[0].options.map((o) => o.label),
    ).toEqual(["Free", "Option 6"]);
    plan.innerHTML = "<option>Choice</option>".repeat(101);
    expect(() => w.discoverBrowserControls()).toThrow("too many options");
    plan.innerHTML = `<option>${"x".repeat(160)}</option>`.repeat(30);
    expect(() => w.discoverBrowserControls()).toThrow("too many options");
  });
});

describe("browser edits and undo", () => {
  it.each([
    ['<input id="field" aria-label="Name" value="Before">', "Alice"],
    ['<textarea id="field" aria-label="Note">Before</textarea>', "Long note"],
    ['<input id="field" type="number" aria-label="Tokens" value="10">', "500"],
  ])(
    "fills fields with native events and restores them with undo",
    async (html, value) => {
      const w = widget(html);
      const field = document.querySelector("#field");
      const before = field.value;
      const events = [];
      field.addEventListener("input", () => events.push("input"));
      field.addEventListener("change", () => events.push("change"));
      w.runBrowserAction(action(w, "#field", "fill", { value }));
      expect(field.value).toBe(value);
      expect(events).toEqual(["input", "change"]);
      expect(w.canUndo()).toBe(true);
      w.refreshPageTools();
      w.shadowRoot.querySelector(".undo").click();
      expect(field.value).toBe(before);
      expect(w.status.textContent).toBe("Undone.");
      w.runBrowserAction({ action: "clear", selector: "#field" });
      expect(field.value).toBe("");
      w.runBrowserAction({ action: "focus", selector: "#field" });
      expect(document.activeElement).toBe(field);
      w.runBrowserAction({ action: "fill", selector: "#field", value: "" });
      expect(field.value).toBe("");
    },
  );
  it("checks, unchecks and chooses with native click behavior", () => {
    const w = widget(
      '<input id="check" type="checkbox" aria-label="News"><input type="radio" name="status" id="active" aria-label="Active"><input type="radio" name="status" id="inactive" aria-label="Inactive">',
    );
    const check = document.querySelector("#check");
    w.runBrowserAction(action(w, "#check", "check"));
    expect(check.checked).toBe(true);
    w.runBrowserAction(action(w, "#check", "check"));
    w.undoLastEdit();
    expect(check.checked).toBe(false);
    w.runBrowserAction(action(w, "#check", "check"));
    w.runBrowserAction(action(w, "#check", "uncheck"));
    expect(check.checked).toBe(false);
    w.runBrowserAction(action(w, "#active", "choose"));
    w.runBrowserAction(action(w, "#inactive", "choose"));
    expect(document.querySelector("#active").checked).toBe(false);
    expect(document.querySelector("#inactive").checked).toBe(true);
    expect(w.undoEdit).toBeNull();
    w.runBrowserAction({ action: "click", selector: "#check" });
    expect(check.checked).toBe(true);
  });
  it("selects options by snapshot references and undoes the selection", () => {
    const w = widget(
      '<select id="plan" aria-label="Plan"><option value="f">Free</option><option value="p">Premium</option></select>',
    );
    const plan = document.querySelector("#plan");
    let select = action(w, "#plan", "select", { option: "o1" });
    w.runBrowserAction(select);
    expect(plan.value).toBe("p");
    w.undoLastEdit();
    expect(plan.value).toBe("f");
    select = action(w, "#plan", "select", { option: "o1" });
    w.runBrowserAction(select);
    plan.options[1].value = "changed";
    expect(w.canUndo()).toBe(false);
    expect(() => w.runBrowserAction(select)).toThrow("option changed");
  });
  it("rejects removed, relabeled, retargeted, or disabled controls", () => {
    const w = widget(
      '<form id="form"><input id="field" aria-label="Name"><button id="save">Save</button></form><form id="other"></form>',
    );
    const fill = action(w, "#field", "fill", { value: "Alice" });
    const field = document.querySelector("#field");
    field.setAttribute("aria-label", "New name");
    expect(() => w.runBrowserAction(fill)).toThrow("control changed");
    field.setAttribute("aria-label", "Name");
    field.setAttribute("form", "other");
    expect(() => w.runBrowserAction(fill)).toThrow("control changed");
    field.removeAttribute("form");
    field.disabled = true;
    expect(() => w.runBrowserAction(fill)).toThrow("disabled");
    field.disabled = false;
    field.hidden = true;
    expect(() => w.runBrowserAction(fill)).toThrow("hidden");
    field.remove();
    expect(() => w.runBrowserAction(fill)).toThrow("control changed");
  });
  it("binds selected-field actions to the original selection", () => {
    const w = widget(
      '<input id="one" aria-label="One"><input id="two" aria-label="Two">',
    );
    document.querySelector("#one").focus();
    const fill = action(w, "#one", "fill", { selected: true, value: "Alice" });
    document.querySelector("#two").focus();
    expect(() => w.runBrowserAction(fill)).toThrow("control changed");
    expect(document.querySelector("#one").value).toBe("");
    w.rememberPageField(null);
    expect(w.selectedField).toBeNull();
  });
  it.each([
    [{ action: "unknown", selector: "#field" }, "not supported"],
    [{ action: "click", selector: "[" }, "invalid element selector"],
    [{ action: "click", selector: "#missing" }, "not on this page"],
    [{ action: "click", selector: "input" }, "More than one"],
    [{ action: "click", selector: "#field" }, "button or local link"],
    [{ action: "reveal", selector: "#field" }, "page heading"],
    [{ action: "check", selector: "#field" }, "checkbox or radio"],
    [{ action: "fill", selector: "#button", value: "a" }, "text or number"],
    [{ action: "fill", selector: "#readonly", value: "a" }, "read-only"],
    [{ action: "fill", selector: "#field", value: 123 }, "invalid field value"],
    [
      { action: "fill", selector: "#field", value: "x".repeat(2001) },
      "invalid field value",
    ],
    [{ action: "fill", selector: "#number", value: "many" }, "Enter a number"],
    [{ action: "fill", selector: "#select", value: "a" }, "Use select"],
    [{ action: "clear", selector: "#select" }, "Use select"],
    [{ action: "select", selector: "#field" }, "option changed"],
  ])("rejects invalid browser action %#", (result, message) => {
    const w = widget(
      '<input id="field"><input id="number" type="number"><input id="readonly" readonly><button id="button">Go</button><select id="select"><option>One</option></select>',
    );
    expect(() => w.runBrowserAction(result)).toThrow(message);
  });
  it("clicks exactly one equivalent link and rejects a removed representative", () => {
    const w = widget('<a href="/users">Users</a><a href="/users">USERS</a>');
    const clicked = vi.fn((event) => event.preventDefault());
    document
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", clicked));
    const click = action(w, "a", "click");
    w.runBrowserAction(click);
    expect(clicked).toHaveBeenCalledOnce();
    document.querySelector("a").remove();
    expect(() => w.runBrowserAction(click)).toThrow("control changed");
    w.runBrowserAction(action(w, "a", "click"));
    expect(clicked).toHaveBeenCalledTimes(2);
  });
  it("invalidates undo after a manual edit, form submit, or page change", async () => {
    const w = widget(
      '<form><input id="name" aria-label="Name"><button>Save</button></form>',
    );
    const field = document.querySelector("#name");
    const fill = () =>
      w.runBrowserAction(action(w, "#name", "fill", { value: "Alice" }));
    fill();
    field.value = "Bob";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(w.canUndo()).toBe(false);
    fill();
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true }));
    expect(w.canUndo()).toBe(false);
    field.value = "Bob";
    fill();
    window.history.replaceState({}, "", "/elsewhere");
    window.dispatchEvent(new Event("popstate"));
    expect(w.undoEdit).toBeNull();
    expect(w.selectedField).toBeNull();
    w.undoLastEdit();
    expect(field.value).toBe("Alice");
  });
  it("rejects undo when metadata or dropdown options change", () => {
    const w = widget(
      '<select id="s" aria-label="Choice"><option>A</option><option>B</option></select>',
    );
    w.runBrowserAction(action(w, "#s", "select", { option: "o1" }));
    const s = document.querySelector("#s");
    s.insertAdjacentHTML("beforeend", "<option>More</option>".repeat(101));
    expect(w.canUndo()).toBe(false);
    w.busy = true;
    w.undoLastEdit();
    expect(s.value).toBe("B");
  });
});

describe("dates, times, and page movement", () => {
  it.each([
    ["date", "October 1st, 2026", "2026-10-01"],
    ["date", "2026-10-01", "2026-10-01"],
    ["time", "2:30 PM", "14:30"],
    ["time", "12 am", "00:00"],
    ["time", "14:30", "14:30"],
    ["time", "", ""],
  ])("normalizes %s input %s", (type, value, expected) => {
    const w = widget(`<input id="field" type="${type}" aria-label="When">`);
    w.runBrowserAction(action(w, "#field", "fill", { value }));
    expect(document.querySelector("#field").value).toBe(expected);
  });
  it.each([
    ["date", "tomorrow"],
    ["date", "February 30, 2026"],
    ["time", "noon"],
    ["time", "13 pm"],
    ["time", "24:00"],
    ["time", "0 am"],
    ["time", "12:60"],
  ])("rejects invalid %s value %s", (type, value) => {
    const w = widget(`<input id="field" type="${type}" aria-label="When">`);
    expect(() =>
      w.runBrowserAction(action(w, "#field", "fill", { value })),
    ).toThrow();
    expect(document.querySelector("#field").value).toBe("");
  });
  it("defaults spoken dates to this year and enforces min/max/step", () => {
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    const w = widget(
      '<input id="field" type="date" aria-label="Date" min="2026-10-01" max="2026-10-31" step="2" value="2026-10-01">',
    );
    w.runBrowserAction(action(w, "#field", "fill", { value: "October 3" }));
    expect(document.querySelector("#field").value).toBe("2026-10-03");
    expect(() =>
      w.runBrowserAction(action(w, "#field", "fill", { value: "October 2" })),
    ).toThrow("allowed range or step");
  });
  it("scrolls in each direction, reveals headings, and respects reduced motion", () => {
    const w = widget('<h2 id="billing">Billing</h2>');
    w.browserSnapshot = w.discoverBrowserControls();
    const page_id = w.browserSnapshot.page.page_id;
    for (const direction of ["up", "down", "top", "bottom"])
      w.runBrowserAction({ action: "scroll", page_id, direction });
    expect(window.scrollBy).toHaveBeenCalledWith({
      top: -window.innerHeight * 0.8,
      behavior: "smooth",
    });
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
    window.matchMedia.mockReturnValue({ matches: true });
    w.runBrowserAction(action(w, "#billing", "reveal"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "instant",
    });
    expect(HTMLElement.prototype.animate).toHaveBeenCalled();
    expect(() =>
      w.runBrowserAction({
        action: "scroll",
        page_id: "stale",
        direction: "down",
      }),
    ).toThrow("page changed");
  });
  it("uses native history only for the current page and known directions", () => {
    const w = widget();
    w.browserSnapshot = w.discoverBrowserControls();
    const page_id = w.browserSnapshot.page.page_id;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => {});
    w.runBrowserAction({ action: "history", page_id, direction: "back" });
    w.runBrowserAction({ action: "history", page_id, direction: "forward" });
    expect(back).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();
    expect(() =>
      w.runBrowserAction({ action: "history", page_id, direction: "go" }),
    ).toThrow("page changed");
  });
});

describe("active form submission", () => {
  it("submits a valid form with its submitter and rejects invalid fields", () => {
    const w = widget(
      '<form id="form"><input id="name" required aria-label="Name"><button name="commit" value="save">Save</button></form>',
    );
    const submit = {
      action: "submit",
      page_id: action(w, "#name", "fill").page_id,
    };
    const submissions = vi.fn((event) => event.preventDefault());
    document.querySelector("form").addEventListener("submit", submissions);
    expect(() => w.runBrowserAction(submit)).toThrow("highlighted fields");
    document.querySelector("#name").value = "Alice";
    w.runBrowserAction(submit);
    expect(submissions).toHaveBeenCalledOnce();
    expect(submissions.mock.calls[0][0].submitter.name).toBe("commit");
    expect(w.status.textContent).toBe("Form submitted.");
  });
  it.each([
    ["", "no available form"],
    ["<form></form><form></form>", "Select a field"],
    [
      "<form><button disabled>Save</button></form>",
      "submit button is unavailable",
    ],
    [
      '<form action="https://elsewhere.test"><button>Save</button></form>',
      "stay on this website",
    ],
  ])("rejects unavailable or ambiguous forms %#", (html, message) => {
    const w = widget(html);
    w.browserSnapshot = w.discoverBrowserControls();
    expect(() =>
      w.runBrowserAction({
        action: "submit",
        page_id: w.browserSnapshot.page.page_id,
      }),
    ).toThrow(message);
  });
  it("selects one of multiple forms and rejects stale signatures", () => {
    const w = widget(
      '<form id="one"><input id="name" aria-label="Name"><button>Save</button></form><form></form>',
    );
    document.querySelector("#name").focus();
    w.browserSnapshot = w.discoverBrowserControls();
    const result = {
      action: "submit",
      page_id: w.browserSnapshot.page.page_id,
    };
    document.querySelector("#one").method = "post";
    expect(() => w.runBrowserAction(result)).toThrow("form changed");
    expect(() => w.runBrowserAction({ ...result, page_id: "other" })).toThrow(
      "page changed",
    );
    document.querySelector("#name").remove();
    expect(w.activeFormState().error).toContain("available field");
  });
  it("rejects standalone inputs, hidden owners, and unsupported selected controls", () => {
    const w = widget(
      '<input id="alone" aria-label="Alone"><form id="f" hidden></form><input id="hiddenOwner" form="f" aria-label="Field">',
    );
    document.querySelector("#alone").focus();
    expect(w.activeFormState().error).toContain("no form");
    document.querySelector("#hiddenOwner").focus();
    expect(w.activeFormState().error).toContain("Show the form");
    document.querySelector("#hiddenOwner").type = "password";
    expect(w.activeFormState().error).toContain("available field");
  });
});
