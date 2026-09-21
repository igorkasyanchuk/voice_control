import { it, expect, vi } from "vitest";
import {
  setupWidgetTests,
  widget,
  response,
  answer,
  speech,
} from "./helpers.js";
setupWidgetTests();

it("bounds interpretation without executing or retrying", async () => {
  const w = widget("", { requestTimeout: "1000" });
  fetch.mockImplementation(() => new Promise(() => {}));
  const pending = w.submit("save");
  await vi.advanceTimersByTimeAsync(1001);
  expect(w.busy).toBe(false);
  expect(w.status.textContent).toContain("Understanding took too long");
  expect(fetch).toHaveBeenCalledOnce();
  await pending;
});

it("reports uncertain execution on timeout and never retries", async () => {
  const w = widget("", { requestTimeout: "1000" });
  fetch
    .mockResolvedValueOnce(response({ kind: "execute", ticket: "once" }))
    .mockImplementation(() => new Promise(() => {}));
  const pending = w.submit("save");
  await vi.advanceTimersByTimeAsync(1001);
  expect(w.busy).toBe(false);
  expect(w.status.textContent).toContain("may already have completed");
  expect(fetch).toHaveBeenCalledTimes(2);
  await pending;
});

it("shows an opt-in text-only notification and dismisses it", async () => {
  const w = widget();
  answer({
    kind: "message",
    message: "Saved",
    notification: "<b>Plan updated</b>",
  });
  await w.submit("save");
  const notice = w.shadowRoot.querySelector(".notification");
  expect(notice).not.toBeNull();
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe("<b>Plan updated</b>");
  expect(notice.querySelector("b")).toBeNull();
  await vi.advanceTimersByTimeAsync(5000);
  expect(notice.hidden).toBe(true);
});

it("restores microphone intent and completion notice after pagehide/pageshow", async () => {
  speech();
  const w = widget();
  w.startMicrophone();
  answer({ kind: "message", notification: "Plan updated." });
  await w.submit("save");
  window.dispatchEvent(new Event("pagehide"));
  expect(w.listening).toBe(false);
  window.dispatchEvent(new Event("pageshow"));
  expect(w.listening).toBe(true);
  expect(w.panel.hidden).toBe(false);
  expect(w.shadowRoot.querySelector(".notification").textContent).toBe(
    "Plan updated.",
  );
});

it("bounds reading the response body and aborts the underlying request", async () => {
  const w = widget("", { requestTimeout: "1000" });
  fetch.mockResolvedValueOnce({ ...response({}), json: () => new Promise(() => {}) });
  const pending = w.submit("save");
  await vi.advanceTimersByTimeAsync(1001);
  await pending;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(w.status.textContent).toContain("Understanding took too long");
});

it("bounds catalog requests and uses a safe default for invalid timeouts", async () => {
  const w = widget("", { requestTimeout: "NaN" });
  fetch.mockImplementation(() => new Promise(() => {}));
  const pending = w.toggleHelp();
  await vi.advanceTimersByTimeAsync(30001);
  await pending;
  expect(w.status.textContent).toContain("Loading commands took too long");
});

it("keeps successful requests free of late timeouts and respects caller cancellation", async () => {
  const w = widget("", { requestTimeout: "1000" });
  answer({ kind: "message", message: "Saved" });
  await w.submit("save");
  await vi.advanceTimersByTimeAsync(1001);
  expect(w.status.textContent).toBe("Saved");
  const controller = new AbortController();
  controller.abort();
  fetch.mockImplementationOnce((_url, options) => {
    expect(options.signal.aborted).toBe(true);
    return Promise.reject(new DOMException("Canceled", "AbortError"));
  });
  await expect(w.api("commands", null, controller.signal)).rejects.toHaveProperty("name", "AbortError");
});

it("only notifies for opted-in successful results", async () => {
  const w = widget();
  const notice = w.shadowRoot.querySelector(".notification");
  answer({ kind: "message", message: "Saved" });
  await w.submit("save");
  expect(notice.hidden).toBe(true);
  fetch.mockResolvedValueOnce(response({ kind: "question", message: "Which?", notification: "Not yet" }));
  await w.submit("save");
  expect(notice.hidden).toBe(true);
  fetch.mockResolvedValueOnce(response({ message: "Failed", notification: "Wrong" }, 500));
  await w.submit("save");
  expect(notice.hidden).toBe(true);
  for (const text of ["", " ", 42, "x".repeat(201)]) {
    answer({ kind: "message", notification: text });
    await w.submit("save");
    expect(notice.hidden).toBe(true);
  }
});

it("does not restore expired notifications or a deliberately stopped microphone", async () => {
  speech();
  const w = widget();
  w.startMicrophone();
  w.stopMicrophone();
  window.dispatchEvent(new Event("pagehide"));
  sessionStorage.setItem("voice_control:notification", JSON.stringify({ text: "Old", until: Date.now() - 1 }));
  window.dispatchEvent(new Event("pageshow"));
  expect(w.listening).toBe(false);
  expect(w.shadowRoot.querySelector(".notification").hidden).toBe(true);
  expect(sessionStorage.getItem("voice_control:notification")).toBeNull();
});
