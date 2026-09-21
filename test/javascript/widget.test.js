import { describe, it, expect, vi } from "vitest";
import {
  setupWidgetTests,
  widget,
  response,
  answer,
  key,
  speech,
  say,
} from "./helpers.js";
setupWidgetTests();

describe("widget lifecycle and keyboard controls", () => {
  it("opens, closes, stops listening, and exposes the host API", () => {
    const w = widget();
    expect(
      w.shadowRoot.querySelector(".launcher").getAttribute("aria-expanded"),
    ).toBe("true");
    w.connectedCallback();
    window.VoiceControl.setContext({ area: "admin" });
    window.VoiceControl.configure({ navigate: vi.fn() });
    expect(w.clientContext).toEqual({ area: "admin" });
    window.VoiceControl.close();
    expect(w.panel.hidden).toBe(true);
    window.VoiceControl.open();
    expect(w.status.textContent).toContain("Voice is unavailable");
    w.shadowRoot.querySelector(".close").click();
    w.shadowRoot.querySelector(".launcher").click();
    expect(w.panel.hidden).toBe(false);
    key(w.input, "Escape");
    expect(w.panel.hidden).toBe(true);
    key(window, "u", { ctrlKey: true, shiftKey: true });
    expect(w.panel.hidden).toBe(false);
    key(window, "u", { ctrlKey: true, shiftKey: true, repeat: true });
    expect(w.panel.hidden).toBe(false);
    key(window, "u", { ctrlKey: true, shiftKey: true });
    expect(w.panel.hidden).toBe(true);
  });
  it("supports macOS shortcuts and closes after inactivity", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const w = widget("", { shortcut: "mod+shift+u", idleTimeout: "1000" });
    key(window, "u", { metaKey: true, shiftKey: true });
    expect(w.panel.hidden).toBe(true);
    key(window, "u", { metaKey: true, shiftKey: true });
    w.input.dispatchEvent(new Event("input"));
    w.shadowRoot.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.panel.hidden).toBe(true);
  });
  it("persists an open panel across navigation and reconnects after removal", async () => {
    const w = widget();
    window.dispatchEvent(new Event("pagehide"));
    expect(
      JSON.parse(sessionStorage.getItem("voice_control:resume")).listening,
    ).toBeFalsy();
    w.remove();
    await vi.advanceTimersByTimeAsync(0);
    sessionStorage.setItem(
      "voice_control:resume",
      JSON.stringify({ until: Date.now() + 1000, listening: false }),
    );
    document.body.append(w);
    expect(w.panel.hidden).toBe(false);
    w.remove();
    document.body.append(w);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.initialized).toBe(true);
    key(window, "u", { ctrlKey: true, shiftKey: true });
    expect(w.panel.hidden).toBe(true);
  });
  it("handles unavailable storage and malformed resume data", () => {
    sessionStorage.setItem("voice_control:resume", "not json");
    const w = widget();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
    w.open(false);
    expect(() => w.close()).not.toThrow();
  });
});

describe("speech capture", () => {
  it("uses the configured speech language", () => {
    speech();
    const w = widget("", { speechLanguage: "uk-UA" });
    w.shadowRoot.querySelector(".mic").click();
    expect(w.recognition.lang).toBe("uk-UA");
    w.recognition.onerror({ error: "language-not-supported" });
    expect(w.status.textContent).toContain("configured speech language");
  });

  it("waits for complete speech and restarts after a recognition end", async () => {
    speech();
    const w = widget();
    w.shadowRoot.querySelector(".mic").click();
    const r = w.recognition;
    expect(r.lang).toBe("en-US");
    expect(r.start).toHaveBeenCalledOnce();
    say(r, "give user 42");
    say(r, "100 tokens", false);
    await vi.advanceTimersByTimeAsync(650);
    expect(fetch).not.toHaveBeenCalled();
    answer({ kind: "message", message: "Granted" });
    say(r, "100 tokens");
    await vi.advanceTimersByTimeAsync(600);
    expect(JSON.parse(fetch.mock.calls[0][1].body).transcript).toBe(
      "give user 42 100 tokens",
    );
    expect(w.status.textContent).toBe("Granted");
    r.onend();
    await vi.advanceTimersByTimeAsync(300);
    expect(r.start.mock.calls.length).toBeGreaterThan(1);
    r.onerror({ error: "no-speech" });
    expect(w.listening).toBe(true);
    r.onerror({ error: "not-allowed" });
    expect(w.listening).toBe(false);
    expect(w.status.textContent).toContain("Microphone unavailable");
  });
  it("does not process stale speech, busy responses, or duplicate starts", () => {
    speech();
    const w = widget();
    w.startMicrophone();
    const r = w.recognition;
    const callback = r.onresult;
    w.startMicrophone();
    expect(w.recognition).toBe(r);
    w.busy = true;
    say(r, "ignored");
    expect(w.input.value).toBe("");
    w.busy = false;
    w.stopMicrophone();
    callback({ resultIndex: 0, results: [] });
    expect(w.input.value).toBe("");
  });
  it("handles recognition start exceptions", () => {
    speech();
    const w = widget();
    w.startMicrophone();
    w.recognition.start.mockImplementation(() => {
      throw new DOMException("running", "InvalidStateError");
    });
    w.resumeRecognition();
    expect(w.listening).toBe(true);
    w.recognition.start.mockImplementation(() => {
      throw new Error("denied");
    });
    w.resumeRecognition();
    expect(w.listening).toBe(false);
  });
  it("submits finalized push-to-talk speech on release", async () => {
    speech();
    const w = widget();
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    const r = w.recognition;
    say(r, "open users");
    answer({ kind: "message", message: "Opened" });
    key(window, " ", { code: "Space" }, "keyup");
    expect(r.stop).toHaveBeenCalledOnce();
    r.onend();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.pushToTalk).toBeNull();
    expect(w.status.textContent).toBe("Opened");
  });
  it.each([
    ["draft", "Speech was not finalized"],
    ["", "No speech captured"],
  ])("retains unfinished push-to-talk draft %s", async (text, message) => {
    speech();
    const w = widget();
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    say(w.recognition, text, false);
    key(window, "Control", {}, "keyup");
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.status.textContent).toContain(message);
    expect(w.input.value).toBe(text);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops push-to-talk on blur and visibility loss", () => {
    speech();
    const w = widget();
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    window.dispatchEvent(new Event("blur"));
    expect(w.listening).toBe(false);
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(w.listening).toBe(false);
    key(window, "Space", {}, "keyup");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses webkit fallback and handles stop failures", async () => {
    speech();
    window.webkitSpeechRecognition = window.SpeechRecognition;
    delete window.SpeechRecognition;
    const w = widget();
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    w.recognition.stop.mockImplementation(() => {
      throw new Error("ended");
    });
    key(window, " ", { code: "Space" }, "keyup");
    expect(w.status.textContent).toContain("No speech captured");
    delete window.webkitSpeechRecognition;
    key(window, " ", { code: "Space", ctrlKey: true, shiftKey: true });
    expect(w.pushToTalk).toBeNull();
  });
});

describe("command requests and results", () => {
  it("sends CSRF, page controls, current URL, and custom context then executes a ticket", async () => {
    const w = widget("<button>Save</button>");
    window.VoiceControl.setContext(() => ({ area: "settings" }));
    answer({ kind: "message", message: "Saved" });
    w.input.value = " save ";
    w.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/voice_control/interpret");
    expect(options.headers["X-CSRF-Token"]).toBe("test-csrf");
    expect(options.credentials).toBe("same-origin");
    expect(JSON.parse(options.body)).toMatchObject({
      transcript: "save",
      context: { area: "settings", path: "/account", url: location.href },
      browser_page: { elements: [{ label: "Save" }] },
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      ticket: "signed",
    });
    expect(w.status.textContent).toBe("Saved");
    expect(w.busy).toBe(false);
    expect(w.input.value).toBe("");
  });
  it("retains continuation and renders choices as text", async () => {
    const w = widget();
    fetch.mockResolvedValueOnce(
      response({
        kind: "question",
        continuation: "next",
        message: "Which user?",
      }),
    );
    await w.submit("grant tokens");
    expect(w.continuation).toBe("next");
    fetch.mockResolvedValueOnce(
      response({
        kind: "ambiguous",
        candidates: [{ key: "users", description: "<b>Users</b>" }],
      }),
    );
    await w.submit("42");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty(
      "browser_page",
    );
    expect(w.choices.textContent).toBe("1. <b>Users</b>");
    expect(w.choices.querySelector("b")).toBeNull();
    answer({ kind: "message", message: "Chosen" });
    w.choices.querySelector("button").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(fetch.mock.calls[2][1].body).command).toBe("users");
  });
  it("cancels pending interpretation and ignores a late result", async () => {
    const w = widget();
    let resolve;
    fetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = w.submit("save");
    await w.submit("cancel");
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    resolve(response({ kind: "execute", ticket: "late" }));
    await pending;
    expect(fetch).toHaveBeenCalledOnce();
    expect(w.status.textContent).toBe("Command canceled.");
  });
  it("cancels waiting for execution without claiming rollback", async () => {
    const w = widget();
    let resolve;
    fetch
      .mockResolvedValueOnce(response({ kind: "execute", ticket: "running" }))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    const pending = w.submit("save");
    await vi.advanceTimersByTimeAsync(0);
    await w.submit("cancel");
    expect(w.status.textContent).toContain("may already have run");
    resolve(response({ kind: "message", message: "Late" }));
    await pending;
    expect(w.status.textContent).not.toBe("Late");
  });
  it("handles local cancellation, undo, closed panel, and busy submission", async () => {
    const w = widget();
    await w.submit("undo");
    expect(w.status.textContent).toContain("No unsaved field edit");
    await w.submit("");
    w.busy = true;
    await w.submit("save");
    w.busy = false;
    await w.submit("close voice control");
    await w.submit("save");
    expect(w.panel.hidden).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [response({}, 200, "text/html"), "Your session changed"],
    [response({ message: "Denied" }, 403), "Denied"],
    [response({}, 500), "could not be completed"],
  ])("shows safe request failures", async (reply, message) => {
    const w = widget();
    fetch.mockResolvedValueOnce(reply);
    await w.submit("save");
    expect(w.status.textContent).toContain(message);
    expect(w.busy).toBe(false);
  });
  it("handles abort errors without overwriting feedback", async () => {
    const w = widget();
    fetch.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await w.submit("save");
    expect(w.status.textContent).not.toContain("aborted");
  });
  it("dispatches application events and respects custom/Turbo navigation", async () => {
    const w = widget();
    const handler = vi.fn();
    window.addEventListener("account:changed", handler, { once: true });
    answer({
      kind: "event",
      name: "account:changed",
      detail: { plan: "premium" },
    });
    await w.submit("change plan");
    expect(handler.mock.calls[0][0].detail).toEqual({ plan: "premium" });
    const navigate = vi.fn();
    window.VoiceControl.configure({ navigate });
    answer({ kind: "navigate", url: "/users?active=true#list" });
    await w.submit("users");
    expect(navigate).toHaveBeenCalledWith("/users?active=true#list");
    w.options = null;
    window.Turbo = { visit: vi.fn() };
    answer({ kind: "navigate", url: "/settings" });
    await w.submit("settings");
    expect(window.Turbo.visit).toHaveBeenCalledWith(
      "http://localhost/settings",
    );
    answer({ kind: "navigate", url: "https://elsewhere.test" });
    await w.submit("leave");
    expect(w.status.textContent).toContain("stay on this website");
  });
  it("runs returned browser edits and rejects navigation during interpretation", async () => {
    const w = widget('<input id="name" aria-label="Name">');
    answer({
      kind: "browser",
      action: "fill",
      selector: "#name",
      value: "Alice",
    });
    await w.submit("fill Name with Alice");
    expect(document.querySelector("#name").value).toBe("Alice");
    fetch.mockImplementationOnce(async () => {
      window.history.replaceState({}, "", "/other");
      return response({
        kind: "browser",
        action: "fill",
        selector: "#name",
        value: "Wrong",
      });
    });
    await w.submit("fill Name with Wrong");
    expect(w.status.textContent).toContain("page changed");
    expect(document.querySelector("#name").value).toBe("Alice");
  });
  it("renders debug data safely and copies it with a fallback", async () => {
    const w = widget("", { debug: "true" });
    const payload = {
      stage: "interpret",
      duration_ms: 20,
      command_labels: { home: "Home" },
      jev_result: {
        probabilities: { home: 0.8, other: 0.2 },
        answer: "<script>bad</script>",
      },
      unused: null,
    };
    fetch.mockResolvedValueOnce(
      response({ kind: "question", debug: payload, message: "Which?" }),
    );
    await w.submit("where");
    const pre = w.shadowRoot.querySelector("pre");
    expect(pre.textContent).toContain("Home [home]");
    expect(pre.textContent).toContain("interpret ms: 20");
    expect(pre.querySelector("script")).toBeNull();
    w.shadowRoot.querySelector(".copy-debug").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(pre.textContent);
    navigator.clipboard.writeText.mockRejectedValue(new Error("denied"));
    await w.copyDebug();
    expect(w.shadowRoot.querySelector(".copy-status").textContent).toContain(
      "Copy unavailable",
    );
    pre.textContent = "";
    await w.copyDebug();
    w.dataset.debug = "false";
    await w.copyDebug();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });
});
