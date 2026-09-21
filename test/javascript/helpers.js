import { beforeEach, afterEach, vi } from "vitest";
import { TextEncoder } from "node:util";
import "../../assets/widget.js";

export function setupWidgetTests() {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = "";
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';
    window.history.replaceState({}, "", "/account?tab=plan");
    // jsdom has no layout, animation, scrolling, or speech engine.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      function () {
        return this.hidden || this.style.display === "none"
          ? []
          : [{ width: 100, height: 30 }];
      },
    );
    window.TextEncoder = TextEncoder;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.animate = vi.fn(() => ({ cancel: vi.fn() }));
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    window.matchMedia = vi.fn(() => ({ matches: false }));
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue() },
    });
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.Turbo;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ commands: [] })),
    );
  });
  afterEach(async () => {
    document.body.replaceChildren();
    await vi.advanceTimersByTimeAsync(0);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}

export function widget(html = "", options = {}) {
  document.body.innerHTML = html;
  const element = document.createElement("voice-control-widget");
  Object.assign(element.dataset, {
    endpoint: "/voice_control",
    browserActions: "true",
    shortcut: "ctrl+shift+u",
    pushToTalkShortcut: "ctrl+shift+space",
    ...options,
  });
  document.body.append(element);
  element.open(false);
  return element;
}
export function response(data, status = 200, type = "application/json") {
  return {
    ok: status < 400,
    status,
    headers: { get: () => type },
    json: async () => data,
  };
}
export function answer(data) {
  fetch
    .mockResolvedValueOnce(response({ kind: "execute", ticket: "signed" }))
    .mockResolvedValueOnce(response(data));
}
export function key(target, key, options = {}, type = "keydown") {
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...options,
    }),
  );
}
export function speech() {
  window.SpeechRecognition = class {
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
  };
}
export function say(recognition, text, final = true) {
  const result = [{ transcript: text }];
  result.isFinal = final;
  recognition.onresult({ resultIndex: 0, results: [result] });
}
export function action(widget, selector, action, extra = {}) {
  widget.browserSnapshot = widget.discoverBrowserControls();
  const node = document.querySelector(selector);
  const entry = [...widget.browserSnapshot.targets].find(
    ([, entry]) => entry.node === node,
  );
  return {
    action,
    target: entry?.[0],
    page_id: widget.browserSnapshot.page.page_id,
    ...extra,
  };
}
