(() => {
  if (customElements.get("voice-control-widget")) return;

  class VoiceControlWidget extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${this.dataset.endpoint}/widget.css?v=${encodeURIComponent(this.dataset.version || "0.1.0")}">
        <button class="launcher" type="button" aria-label="Open Voice Control" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="notification" role="status" aria-live="polite" hidden></div>
        <section class="panel" role="dialog" aria-label="Voice Control commands" hidden>
          <header><strong>voice_control<span>↗</span></strong><div class="controls"><button class="help-toggle" type="button" aria-label="Show all commands">?</button><button class="close" type="button" aria-label="Close and stop listening">×</button></div></header>
          <div class="activity"><span class="indicator"></span><span class="mode">Ready when you are</span><button class="mic" type="button" aria-label="Start microphone">Mic off</button></div>
          <div class="field-tools" hidden><span class="selected-field" aria-live="polite"></span><button class="undo" type="button" hidden>Undo</button></div>
          <p class="status" role="status" aria-live="polite">Say what you want to do, or type below.</p>
          <div class="choices"></div>
          <form><label class="sr-only" for="command">Your command</label><input id="command" autocomplete="off" placeholder="Try “open users”…" maxlength="2000"><button class="send" type="submit" aria-label="Run command">↗</button></form>
          <div class="suggestions" aria-label="Suggested commands" hidden></div>
          <details class="debug" hidden><summary>Command details</summary><button class="copy-debug" type="button">Copy details</button><span class="copy-status" role="status"></span><pre tabindex="0"></pre></details>
          <div class="help" hidden><label class="sr-only" for="search">Search commands</label><input id="search" placeholder="Find a command…" type="search" maxlength="160"><div class="catalog"></div></div>
        </section>`;
      this.panel = this.shadowRoot.querySelector(".panel");
      this.input = this.shadowRoot.querySelector("#command");
      this.status = this.shadowRoot.querySelector(".status");
      this.choices = this.shadowRoot.querySelector(".choices");
      this.help = this.shadowRoot.querySelector(".help");
      this.shadowRoot
        .querySelector(".copy-debug")
        .addEventListener("click", () => this.copyDebug());
      this.shadowRoot
        .querySelector(".undo")
        .addEventListener("click", () => this.undoLastEdit());
      this.shadowRoot
        .querySelector(".launcher")
        .addEventListener("click", () => this.toggle());
      this.shadowRoot
        .querySelector(".close")
        .addEventListener("click", () => this.close());
      this.shadowRoot
        .querySelector(".mic")
        .addEventListener("click", () =>
          this.listening ? this.stopMicrophone() : this.startMicrophone(),
        );
      this.shadowRoot
        .querySelector(".help-toggle")
        .addEventListener("click", () => this.toggleHelp());
      this.shadowRoot
        .querySelector("#search")
        .addEventListener("input", () => this.renderCatalog());
      this.shadowRoot
        .querySelector("form")
        .addEventListener("submit", (event) => {
          event.preventDefault();
          this.submit(this.input.value);
        });
      this.shadowRoot.addEventListener("keydown", (event) => {
        this.navigateHelp(event);
        if (event.key === "Escape") {
          event.stopPropagation();
          this.close();
        }
      });
      this.shadowRoot.addEventListener("pointerdown", () => this.touch());
      this.input.addEventListener("input", () => this.touch());
      this.keyHandler = (event) => {
        if (this.matchesShortcut(event, this.dataset.pushToTalkShortcut)) {
          event.preventDefault();
          if (!event.repeat) this.startPushToTalk(event);
        } else if (
          !event.repeat &&
          this.matchesShortcut(event, this.dataset.shortcut)
        ) {
          event.preventDefault();
          this.toggle();
        }
      };
      this.keyReleaseHandler = (event) => {
        if (
          this.pushToTalk &&
          (event.code === this.pushToTalk.code ||
            event.key === this.pushToTalk.key ||
            ["Meta", "Control", "Alt", "Shift"].includes(event.key))
        ) {
          event.preventDefault();
          this.releasePushToTalk();
        }
      };
      this.blurHandler = () => {
        if (this.pushToTalk) this.stopMicrophone();
      };
      this.visibilityHandler = () => {
        if (document.hidden) this.blurHandler();
      };
      this.pageShowHandler = () => this.restoreSession();
      this.pageHandler = () => {
        const resume = !this.panel.hidden
          ? { until: this.idleDeadline, listening: this.listening }
          : null;
        this.close(false);
        try {
          if (resume)
            sessionStorage.setItem("voice_control:resume", JSON.stringify(resume));
          if (this.notification?.until > Date.now())
            sessionStorage.setItem(
              "voice_control:notification",
              JSON.stringify(this.notification),
            );
        } catch {
          /* Storage may be disabled by the browser. */
        }
      };
      window.addEventListener("keydown", this.keyHandler);
      window.addEventListener("keyup", this.keyReleaseHandler);
      window.addEventListener("blur", this.blurHandler);
      document.addEventListener("visibilitychange", this.visibilityHandler);
      window.addEventListener("pagehide", this.pageHandler);
      window.addEventListener("pageshow", this.pageShowHandler);
      this.pageUrl = location.href;
      this.pageActionsHandler = () => {
        if (this.pageUrl !== location.href) {
          this.pageUrl = location.href;
          this.continuation = null;
          this.choices.replaceChildren();
          this.catalog = [];
          this.catalogVersion = (this.catalogVersion || 0) + 1;
          if (!this.help.hidden) this.loadCatalog();
        }
        if (
          this.selectedField &&
          (this.selectedField.url !== location.href ||
            !this.selectedField.node.isConnected)
        )
          this.selectedField = null;
        clearTimeout(this.pageActionsTimer);
        if (
          this.undoEdit &&
          (!this.undoEdit.node.isConnected ||
            this.undoEdit.url !== location.href)
        )
          this.undoEdit = null;
        if (this.panel.hidden) return;
        this.pageActionsTimer = setTimeout(() => {
          const snapshot = this.refreshPageTools();
          if (!this.help.hidden) this.renderCatalog(snapshot);
        }, 80);
      };
      if (this.dataset.browserActions === "true") {
        this.fieldSelectionHandler = (event) => {
          if (!event.composedPath().includes(this))
            this.rememberPageField(event.target);
        };
        document.addEventListener("focusin", this.fieldSelectionHandler);
        document.addEventListener("pointerdown", this.fieldSelectionHandler);
        this.formSubmitHandler = (event) => {
          if (this.undoEdit?.node.form === event.target) {
            this.undoEdit = null;
            this.pageActionsHandler();
          }
        };
        this.fieldEditHandler = (event) => {
          if (
            this.undoEdit?.node === event.target &&
            this.fieldValue(event.target) !== this.undoEdit.after
          )
            this.undoEdit = null;
          if (!event.composedPath().includes(this)) this.pageActionsHandler();
        };
        document.addEventListener("submit", this.formSubmitHandler, true);
        document.addEventListener("input", this.fieldEditHandler);
        document.addEventListener("change", this.fieldEditHandler);
        this.rememberPageField(document.activeElement);
        this.pageActionsObserver = new window.MutationObserver(
          this.pageActionsHandler,
        );
        this.pageActionsObserver.observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "id",
            "name",
            "type",
            "role",
            "href",
            "for",
            "title",
            "placeholder",
            "class",
            "style",
            "hidden",
            "inert",
            "disabled",
            "readonly",
            "multiple",
            "label",
            "value",
            "aria-hidden",
            "aria-disabled",
            "aria-label",
            "aria-labelledby",
            "data-voice-control-label",
            "data-voice-control-ignore",
            "content",
          ],
        });
      }
      document.addEventListener("turbo:load", this.pageActionsHandler);
      document.addEventListener("turbo:frame-load", this.pageActionsHandler);
      window.addEventListener("popstate", this.pageActionsHandler);
      window.addEventListener("hashchange", this.pageActionsHandler);
      window.VoiceControl = window.VoiceControl || {};
      window.VoiceControl.open = () => this.open();
      window.VoiceControl.close = () => this.close();
      window.VoiceControl.refresh = () => this.pageActionsHandler();
      window.VoiceControl.setContext = (context) => {
        this.clientContext = context;
      };
      window.VoiceControl.configure = (options) => {
        this.options = options;
      };
      this.restoreSession();
    }

    restoreSession() {
      try {
        const resume = JSON.parse(sessionStorage.getItem("voice_control:resume"));
        sessionStorage.removeItem("voice_control:resume");
        if (resume?.until > Date.now()) this.open(resume.listening);
        const notification = JSON.parse(
          sessionStorage.getItem("voice_control:notification"),
        );
        sessionStorage.removeItem("voice_control:notification");
        if (notification?.until > Date.now())
          this.showNotification(notification.text, notification.until);
      } catch {
        /* A fresh visit never needs stored state. */
      }
    }

    disconnectedCallback() {
      // Turbo reparents permanent elements during a render; only dispose actual removals.
      setTimeout(() => {
        if (!this.isConnected) {
          this.close(false);
          window.removeEventListener("keydown", this.keyHandler);
          window.removeEventListener("keyup", this.keyReleaseHandler);
          window.removeEventListener("blur", this.blurHandler);
          document.removeEventListener(
            "visibilitychange",
            this.visibilityHandler,
          );
          window.removeEventListener("pagehide", this.pageHandler);
          window.removeEventListener("pageshow", this.pageShowHandler);
          clearTimeout(this.notificationTimer);
          this.pageActionsObserver?.disconnect();
          document.removeEventListener("submit", this.formSubmitHandler, true);
          document.removeEventListener("input", this.fieldEditHandler);
          document.removeEventListener("change", this.fieldEditHandler);
          document.removeEventListener("focusin", this.fieldSelectionHandler);
          document.removeEventListener(
            "pointerdown",
            this.fieldSelectionHandler,
          );
          document.removeEventListener("turbo:load", this.pageActionsHandler);
          document.removeEventListener(
            "turbo:frame-load",
            this.pageActionsHandler,
          );
          window.removeEventListener("popstate", this.pageActionsHandler);
          window.removeEventListener("hashchange", this.pageActionsHandler);
          this.initialized = false;
        }
      }, 0);
    }

    matchesShortcut(event, shortcut) {
      if (!shortcut) return false;
      const parts = shortcut.toLowerCase().split("+");
      const modifiers = parts.slice(0, -1);
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      const meta =
        modifiers.includes("meta") || (modifiers.includes("mod") && mac);
      const ctrl =
        modifiers.includes("ctrl") || (modifiers.includes("mod") && !mac);
      return (
        event.key.toLowerCase() ===
          (parts.at(-1) === "space" ? " " : parts.at(-1)) &&
        event.metaKey === meta &&
        event.ctrlKey === ctrl &&
        event.shiftKey === modifiers.includes("shift") &&
        event.altKey === modifiers.includes("alt")
      );
    }

    toggle() {
      this.panel.hidden ? this.open() : this.close();
    }

    open(listen = true) {
      if (!this.isConnected || !this.panel.hidden) return;
      this.panel.hidden = false;
      this.shadowRoot
        .querySelector(".launcher")
        .setAttribute("aria-expanded", "true");
      this.input.focus();
      this.touch();
      this.refreshPageTools();
      if (!this.help.hidden) this.renderCatalog();
      if (listen) this.startMicrophone();
    }

    close(focus = true) {
      this.targetHighlight?.cancel();
      this.panel.hidden = true;
      try {
        sessionStorage.removeItem("voice_control:resume");
      } catch {
        /* Storage is optional. */
      }
      this.shadowRoot
        .querySelector(".launcher")
        .setAttribute("aria-expanded", "false");
      this.stopMicrophone();
      clearTimeout(this.idleTimer);
      clearTimeout(this.speechTimer);
      clearTimeout(this.pageActionsTimer);
      this.request?.abort();
      this.generation = (this.generation || 0) + 1;
      this.continuation = null;
      this.choices.replaceChildren();
      if (focus) this.shadowRoot.querySelector(".launcher").focus();
    }

    touch() {
      clearTimeout(this.idleTimer);
      if (!this.panel.hidden) {
        const timeout = Number(this.dataset.idleTimeout) || 120000;
        this.idleDeadline = Date.now() + timeout;
        this.idleTimer = setTimeout(() => this.close(), timeout);
      }
    }

    startMicrophone() {
      const Recognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        this.status.textContent =
          "Voice is unavailable in this browser. Type a command below.";
        return;
      }
      if (this.listening || this.panel.hidden) return;
      this.listening = true;
      this.recognition = new Recognition();
      this.recognition.lang = "en-US";
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      const recognition = this.recognition;
      this.recognition.onresult = (event) => {
        if (this.recognition !== recognition || this.busy || this.panel.hidden)
          return;
        this.touch();
        let final = "";
        let interim = "";
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index++
        ) {
          if (event.results[index].isFinal)
            final += event.results[index][0].transcript;
          else interim += event.results[index][0].transcript;
        }
        if (this.pushToTalk) {
          this.pushToTalk.final = `${this.pushToTalk.final} ${final}`.trim();
          this.pushToTalk.interim = interim;
          this.input.value = `${this.pushToTalk.final} ${interim}`.trim();
          return;
        }
        if (final.trim() || interim) {
          this.pendingSpeech = `${this.pendingSpeech || ""} ${final}`.trim();
          this.input.value = `${this.pendingSpeech} ${interim}`.trim();
          clearTimeout(this.speechTimer);
          if (!interim)
            this.speechTimer = setTimeout(() => {
              const text = this.pendingSpeech;
              this.pendingSpeech = "";
              this.submit(text);
            }, 600);
        }
      };
      this.recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          this.stopMicrophone();
          this.status.textContent =
            "Microphone unavailable. You can still type commands.";
        }
      };
      this.recognition.onend = () => {
        if (this.recognition !== recognition) return;
        if (this.pushToTalk?.released) {
          this.finishPushToTalk();
          return;
        }
        if (this.listening && !this.panel.hidden && !this.busy) {
          this.restartTimer = setTimeout(() => this.resumeRecognition(), 300);
        }
      };
      this.resumeRecognition();
      this.microphoneState();
    }

    resumeRecognition() {
      if (!this.listening || this.busy || this.panel.hidden) return;
      try {
        this.recognition?.start();
      } catch (error) {
        if (error.name !== "InvalidStateError") this.stopMicrophone();
      }
    }

    stopMicrophone() {
      clearTimeout(this.pushToTalk?.timer);
      this.pushToTalk = null;
      this.listening = false;
      clearTimeout(this.restartTimer);
      clearTimeout(this.speechTimer);
      this.pendingSpeech = "";
      if (this.recognition) {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.abort();
        this.recognition = null;
      }
      this.microphoneState();
    }

    startPushToTalk(event) {
      if (this.busy || this.pushToTalk) return;
      this.open(false);
      this.stopMicrophone();
      this.pushToTalk = {
        code: event.code,
        key: event.key,
        final: "",
        interim: "",
        released: false,
      };
      this.startMicrophone();
      if (!this.listening) this.pushToTalk = null;
    }

    releasePushToTalk() {
      const hold = this.pushToTalk;
      if (!hold || hold.released) return;
      hold.released = true;
      clearTimeout(this.restartTimer);
      // stop() delivers final recognition results before onend; abort() discards them.
      hold.timer = setTimeout(() => this.finishPushToTalk(), 1500);
      try {
        this.recognition?.stop();
      } catch {
        this.finishPushToTalk();
      }
    }

    finishPushToTalk() {
      const hold = this.pushToTalk;
      if (!hold?.released) return;
      const text = hold.interim.trim() ? "" : hold.final.trim();
      const draft = `${hold.final} ${hold.interim}`.trim();
      this.stopMicrophone();
      if (this.panel.hidden) return;
      this.input.value = text || draft;
      if (text) this.submit(text);
      else
        this.status.textContent = draft
          ? "Speech was not finalized. Review it and press Enter."
          : "No speech captured. Hold the shortcut and try again.";
    }

    microphoneState() {
      this.shadowRoot.querySelector(".mode").textContent = this.listening
        ? "Listening · English"
        : "Type a command";
      this.shadowRoot.querySelector(".mic").textContent = this.listening
        ? "Mic on"
        : "Mic off";
      this.shadowRoot
        .querySelector(".mic")
        .setAttribute(
          "aria-label",
          this.listening ? "Stop microphone" : "Start microphone",
        );
      this.shadowRoot
        .querySelector(".indicator")
        .classList.toggle("live", !!this.listening);
    }

    async api(path, body, signal) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      let timer;
      const duration = Number(this.dataset.requestTimeout);
      const timeout =
        Number.isInteger(duration) && duration >= 1000 && duration <= 300000
          ? duration
          : 30000;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetch(`${this.dataset.endpoint}/${path}${path === "commands" ? `?path=${encodeURIComponent(location.pathname)}` : ""}`, {
              method: body ? "POST" : "GET",
              credentials: "same-origin",
              signal: controller.signal,
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token":
                  document.querySelector('meta[name="csrf-token"]')?.content ||
                  "",
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            });
            if (
              !response.headers
                .get("content-type")
                ?.includes("application/json")
            )
              throw new Error("Your session changed. Reload the page.");
            const result = await response.json();
            if (path !== "commands")
              this.showDebug(result.debug, { http_status: response.status });
            if (!response.ok)
              throw new Error(
                result.message || "The command could not be completed.",
              );
            return result;
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(
                new Error(
                  path === "execute"
                    ? "The action may already have completed. Check the page before trying again."
                    : path === "interpret"
                      ? "Understanding took too long. Please try again."
                      : "Loading commands took too long. Please try again.",
                ),
              );
              controller.abort();
            }, timeout);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    }

    showNotification(text, until = Date.now() + 5000) {
      if (typeof text !== "string" || !text.trim() || text.length > 200) return;
      clearTimeout(this.notificationTimer);
      this.notification = { text, until };
      const notice = this.shadowRoot.querySelector(".notification");
      notice.textContent = text;
      notice.hidden = false;
      this.notificationTimer = setTimeout(
        () => {
          notice.hidden = true;
          this.notification = null;
        },
        Math.min(5000, Math.max(0, until - Date.now())),
      );
    }

    showDebug(details = {}, extra = {}) {
      if (this.dataset.debug !== "true") return;
      const { duration_ms: duration, ...fields } = details;
      this.debugDetails = {
        ...this.debugDetails,
        ...fields,
        ...(duration !== undefined
          ? { [`${details.stage}_ms`]: duration }
          : {}),
        ...extra,
      };
      const panel = this.shadowRoot.querySelector(".debug");
      panel.hidden = false;
      panel.querySelector(".copy-status").textContent = "";
      panel.querySelector("pre").textContent = Object.entries(this.debugDetails)
        .filter(
          ([key, value]) =>
            key !== "command_labels" && value !== undefined && value !== null,
        )
        .map(([key, value]) => {
          if (key === "jev_result" && value.probabilities) {
            value = {
              ...value,
              probabilities: Object.fromEntries(
                Object.entries(value.probabilities).map(
                  ([command, probability]) => {
                    const label = this.debugDetails.command_labels?.[command];
                    return [
                      label ? `${label} [${command}]` : command,
                      probability,
                    ];
                  },
                ),
              ),
            };
          }
          return `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}`;
        })
        .join("\n");
    }

    async copyDebug() {
      if (this.dataset.debug !== "true") return;
      const panel = this.shadowRoot.querySelector(".debug");
      const report = panel.querySelector("pre").textContent;
      if (!report) return;
      const button = panel.querySelector(".copy-debug");
      button.disabled = true;
      try {
        await navigator.clipboard.writeText(report);
        panel.querySelector(".copy-status").textContent = "Copied.";
      } catch {
        panel.querySelector(".copy-status").textContent =
          "Copy unavailable. Select the details below and copy manually.";
        panel.querySelector("pre").focus();
      } finally {
        button.disabled = false;
      }
    }

    async submit(text = "", command = null) {
      text = text.trim();
      if (/^(undo|undo that|undo last edit)[.!]?$/i.test(text)) {
        this.undoLastEdit();
        return;
      }
      if (
        /^(stop listening|(?:close|stop) voice[ _]control|stop jev|close jev)[.!]?$/i.test(
          text,
        )
      ) {
        this.close();
        return;
      }
      if (/^cancel[.!]?$/i.test(text)) {
        this.request?.abort();
        this.generation = (this.generation || 0) + 1;
        clearTimeout(this.speechTimer);
        this.pendingSpeech = "";
        this.continuation = null;
        this.choices.replaceChildren();
        this.status.textContent = this.executing
          ? "Stopped waiting. The action may already have run; check the result."
          : "Command canceled.";
        return;
      }
      if (this.busy || this.panel.hidden || (!text && !command)) return;
      if (this.pushToTalk) this.stopMicrophone();
      this.debugDetails = {};
      this.showDebug(
        {},
        { transcript: text || "Help / suggestion", outcome: "pending" },
      );
      this.touch();
      clearTimeout(this.speechTimer);
      this.pendingSpeech = "";
      this.busy = true;
      this.refreshPageTools();
      this.recognition?.abort();
      this.request = new AbortController();
      const generation = this.generation || 0;
      const pageUrl = location.href;
      this.shadowRoot.querySelector(".send").disabled = true;
      this.status.textContent = "Understanding…";
      this.choices.replaceChildren();
      try {
        if (this.browserActionsEnabled() && !this.continuation)
          this.browserSnapshot = this.discoverBrowserControls();
        const context =
          typeof this.clientContext === "function"
            ? this.clientContext()
            : this.clientContext;
        let result = await this.api(
          "interpret",
          {
            transcript: text,
            command,
            continuation: this.continuation,
            context: {
              url: location.href,
              path: location.pathname,
              ...context,
            },
            ...(!this.continuation && this.browserActionsEnabled()
              ? { browser_page: this.browserSnapshot.page }
              : {}),
          },
          this.request.signal,
        );
        if (generation !== (this.generation || 0) || this.panel.hidden) return;
        if (pageUrl !== location.href)
          throw new Error("The page changed. Please start the command again.");
        this.continuation = result.continuation || null;
        if (result.kind === "execute") {
          this.executing = true;
          this.status.textContent = "Running…";
          result = await this.api(
            "execute",
            { ticket: result.ticket },
            this.request.signal,
          );
        }
        if (generation !== (this.generation || 0) || this.panel.hidden) return;
        if (pageUrl !== location.href)
          throw new Error("The page changed. Check the action's result before trying again.");
        this.input.value = "";
        this.status.textContent = result.message || "Done.";
        if (result.kind === "ambiguous") {
          result.candidates.forEach((candidate, index) =>
            this.addChoice(`${index + 1}. ${candidate.description}`, () =>
              this.submit("", candidate.key),
            ),
          );
        } else if (result.kind === "reload") {
          this.undoEdit = null;
          location.reload();
        } else if (result.kind === "navigate") {
          this.undoEdit = null;
          const url = new URL(result.url, location.origin);
          if (url.origin !== location.origin)
            throw new Error("Navigation must stay on this website.");
          if (this.options?.navigate)
            this.options.navigate(url.pathname + url.search + url.hash);
          else if (window.Turbo) window.Turbo.visit(url.href);
          else location.assign(url.href);
        } else if (result.kind === "event") {
          this.undoEdit = null;
          window.dispatchEvent(
            new CustomEvent(result.name, { detail: result.detail }),
          );
        } else if (result.kind === "browser") {
          this.runBrowserAction(result);
          this.showDebug(
            {},
            { outcome: "completed", browser_action: result.action },
          );
        } else if (result.kind === "message") {
          this.undoEdit = null;
        }
        if (
          ["message", "navigate", "reload", "event", "browser"].includes(
            result.kind,
          )
        )
          this.showNotification(result.notification);
      } catch (error) {
        this.showDebug(
          {},
          {
            outcome: error.name === "AbortError" ? "canceled" : "error",
            message: error.message,
          },
        );
        if (error.name !== "AbortError")
          this.status.textContent =
            error.message ||
            "Something went wrong. Check the result before trying again.";
      } finally {
        this.executing = false;
        this.busy = false;
        this.refreshPageTools();
        this.shadowRoot.querySelector(".send").disabled = false;
        this.resumeRecognition();
      }
    }

    browserActionsEnabled() {
      return this.dataset.browserActions === "true" && !Array.from(
        document.head.querySelectorAll('meta[name="voice-control-browser-actions"]'),
      ).some((meta) => meta.content.trim().toLowerCase() === "off");
    }

    browserActionsFor(target) {
      if (target instanceof window.HTMLInputElement) {
        if (target.type === "checkbox") return ["check", "uncheck"];
        if (target.type === "radio") return ["choose"];
        if (["button", "submit", "reset"].includes(target.type))
          return ["click"];
        return !target.readOnly &&
          [
            "text",
            "search",
            "email",
            "tel",
            "url",
            "number",
            "date",
            "time",
          ].includes(target.type)
          ? ["fill", "focus", "clear"]
          : [];
      }
      if (target instanceof window.HTMLTextAreaElement)
        return target.readOnly ? [] : ["fill", "focus", "clear"];
      if (target.matches("h1, h2, h3, h4, h5, h6")) return ["reveal"];
      if (target instanceof window.HTMLSelectElement)
        return target.multiple || !this.dropdownOptions(target).length
          ? []
          : ["select", "focus"];
      if (target.matches("button, [role='button']")) return ["click"];
      if (target.matches("a[href]")) {
        const url = new URL(target.href, location.href);
        return url.origin === location.origin &&
          ["http:", "https:"].includes(url.protocol)
          ? ["click"]
          : [];
      }
      return [];
    }

    browserControlVisible(target) {
      return (
        !target.closest(
          "voice-control-widget, [data-voice-control-ignore], [hidden], [inert], [aria-hidden='true']",
        ) &&
        !target.form?.closest("[data-voice-control-ignore]") &&
        !!target.getClientRects().length &&
        !["hidden", "collapse"].includes(
          window.getComputedStyle(target).visibility,
        )
      );
    }

    browserControlMetadata(target, ref) {
      const shorten = (text) =>
        (text || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const readableLabel = (text) => {
        const label = shorten(
          (text || "")
            .normalize("NFC")
            .replace(/[#*0-9]\uFE0F?\u20E3/gu, " ")
            .replace(/[\p{S}\p{Cf}\p{Co}\uFE0E\uFE0F\u2022\u00B7]/gu, " ")
            .replace(/[\p{Cc}]/gu, " "),
        );
        return /[\p{L}\p{N}]/u.test(label) ? label : "";
      };
      const labelText = (node) => {
        if (
          !node ||
          node.matches("input, textarea, select") ||
          node.closest("[data-voice-control-ignore]")
        )
          return "";
        const copy = node.cloneNode(true);
        copy
          .querySelectorAll(
            "input, textarea, select, script, style, svg, [hidden], [inert], [aria-hidden='true'], [role='img'], [data-voice-control-ignore], .material-icons, .material-icons-outlined, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp",
          )
          .forEach((child) => child.remove());
        return copy.textContent;
      };
      const labelledBy = (target.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => labelText(document.getElementById(id)))
        .join(" ");
      const labels = Array.from(target.labels || [])
        .map(labelText)
        .join(" ");
      const buttonValue = target.matches(
        "input[type='button'], input[type='submit'], input[type='reset']",
      )
        ? target.value
        : "";
      let label =
        [
          target.getAttribute("data-voice-control-label"),
          target.getAttribute("aria-label"),
          labelledBy,
          labels,
          target.matches("button, a, [role='button'], h1, h2, h3, h4, h5, h6")
            ? labelText(target)
            : "",
          Array.from(target.querySelectorAll("img[alt]"))
            .filter((image) => this.browserControlVisible(image))
            .map((image) => image.alt)
            .join(" "),
          buttonValue,
          target.getAttribute("placeholder"),
          target.getAttribute("title"),
        ]
          .map(readableLabel)
          .find(Boolean) || "";
      if (
        !target.getAttribute("data-voice-control-label") &&
        !target.getAttribute("aria-label") &&
        !labelledBy.trim() &&
        /^(edit|delete|remove|view|open|details|manage)$/i.test(label)
      ) {
        const row = target.closest("tr, [role='row']");
        const cell = row?.querySelector(
          "th[scope='row'], [role='rowheader'], td, [role='cell'], [role='gridcell']",
        );
        const identity =
          cell?.querySelector("a, strong, [data-voice-control-row-label]") || cell;
        if (
          identity &&
          !identity.contains(target) &&
          this.browserControlVisible(identity)
        ) {
          const copy = identity.cloneNode(true);
          copy
            .querySelectorAll(
              "small, button, input, textarea, select, [hidden], [aria-hidden='true'], [data-voice-control-ignore]",
            )
            .forEach((node) => node.remove());
          const context = readableLabel(labelText(copy));
          if (
            context &&
            !context.includes("@") &&
            !/^(edit|delete|remove|view|open|details|manage)$/i.test(context)
          )
            label = readableLabel(`${label} ${context}`);
        }
      }
      const metadata = {
        ref,
        label,
        id: shorten(target.id),
        name: shorten(target.name),
        tag: target.localName,
        type:
          target instanceof window.HTMLInputElement
            ? target.type
            : target.getAttribute("role") === "button"
              ? "button"
              : "",
      };
      if (label && target instanceof window.HTMLSelectElement) {
        metadata.options = this.dropdownOptions(target).map(
          ({ option, index }) => ({
            ref: `o${index}`,
            label: readableLabel(option.label) || `Option ${index + 1}`,
          }),
        );
        if (
          metadata.options.length > 100 ||
          new window.TextEncoder().encode(JSON.stringify(metadata.options))
            .length > 4096
        )
          throw new Error(
            "This dropdown has too many options for voice commands.",
          );
      }
      return metadata;
    }

    dropdownOptions(target) {
      return Array.from(target.options, (option, index) => ({
        option,
        index,
      })).filter(
        ({ option }) =>
          !option.disabled &&
          !option.closest(
            "optgroup[disabled], [hidden], [data-voice-control-ignore]",
          ) &&
          option.getAttribute("aria-disabled") !== "true",
      );
    }

    rememberPageField(target) {
      this.formSelection =
        target instanceof window.HTMLElement
          ? {
              node: target.closest("input, textarea, select, button, form"),
              url: location.href,
            }
          : null;
      this.selectedField =
        target instanceof window.HTMLElement &&
        this.browserActionsFor(target).some((action) =>
          ["fill", "select"].includes(action),
        ) &&
        this.browserControlVisible(target) &&
        !target.matches(":disabled, [aria-disabled='true']")
          ? { node: target, url: location.href }
          : null;
      this.pageActionsHandler();
    }

    activeFormState() {
      const control =
        this.formSelection?.url === location.href
          ? this.formSelection.node
          : null;
      let form;
      if (control) {
        if (
          !control.isConnected ||
          !this.browserControlVisible(control) ||
          control.matches(":disabled, [aria-disabled='true']") ||
          (!(control instanceof window.HTMLFormElement) &&
            !this.browserActionsFor(control).length)
        )
          return { error: "Select an available field in the form first." };
        form =
          control instanceof window.HTMLFormElement ? control : control.form;
        if (!form) return { error: "This field has no form to submit." };
      } else {
        const forms = Array.from(document.forms).filter((candidate) =>
          this.browserControlVisible(candidate),
        );
        if (forms.length !== 1)
          return {
            error: forms.length
              ? "Select a field in the form you want to submit."
              : "There is no available form to submit on this page.",
          };
        [form] = forms;
      }
      if (!this.browserControlVisible(form))
        return { error: "Show the form before submitting it." };
      const submitter = Array.from(form.elements).find(
        (element) =>
          (element instanceof window.HTMLButtonElement ||
            element instanceof window.HTMLInputElement) &&
          ["submit", "image"].includes(element.type),
      );
      if (
        submitter &&
        (!this.browserControlVisible(submitter) ||
          submitter.matches(":disabled, [aria-disabled='true']"))
      )
        return { error: "The form's submit button is unavailable." };
      const destination = new URL(
        submitter?.getAttribute("formaction") ?? form.action,
        document.baseURI,
      );
      if (
        destination.origin !== location.origin ||
        !["http:", "https:"].includes(destination.protocol)
      )
        return { error: "Form submission must stay on this website." };
      return {
        form,
        control,
        submitter,
        signature: JSON.stringify([
          form.action,
          form.method,
          form.enctype,
          form.target,
          form.noValidate,
          submitter &&
            [
              "formaction",
              "formmethod",
              "formenctype",
              "formtarget",
              "formnovalidate",
              "name",
              "value",
              "type",
            ].map((attribute) => submitter.getAttribute(attribute)),
        ]),
      };
    }

    submitActiveForm(result) {
      const snapshot = this.browserSnapshot;
      if (
        !this.browserActionsEnabled() ||
        !snapshot ||
        result.page_id !== snapshot.page.page_id ||
        snapshot.url !== location.href
      )
        throw new Error("The page changed. Please try the command again.");
      const original = snapshot.formState;
      const current = this.activeFormState();
      if (original?.error || current.error)
        throw new Error(original?.error || current.error);
      if (
        !original ||
        original.form !== current.form ||
        original.control !== current.control ||
        original.submitter !== current.submitter ||
        original.signature !== current.signature
      )
        throw new Error("That form changed. Please start the command again.");
      const { form, submitter } = current;
      if (
        !form.noValidate &&
        !submitter?.formNoValidate &&
        !window.HTMLFormElement.prototype.reportValidity.call(form)
      )
        throw new Error("Check the highlighted fields before submitting.");
      window.HTMLFormElement.prototype.requestSubmit.call(form, submitter);
      this.status.textContent = "Form submitted.";
    }

    discoverBrowserControls() {
      this.browserRefs ||= new WeakMap();
      this.browserRefCounter ||= 0;
      const targets = new Map();
      const elements = [];
      const seenLinks = new Set();
      for (const target of document.querySelectorAll(
        "button, a[href], input, textarea, select, [role='button'], h1, h2, h3, h4, h5, h6",
      )) {
        const actions = this.browserActionsFor(target);
        if (
          !actions.length ||
          !this.browserControlVisible(target) ||
          target.matches(":disabled, [aria-disabled='true']")
        )
          continue;
        if (!this.browserRefs.has(target))
          this.browserRefs.set(target, `e${++this.browserRefCounter}`);
        const ref = this.browserRefs.get(target);
        const metadata = this.browserControlMetadata(target, ref);
        if (!metadata.label) continue;
        if (
          target.matches("a[href]:not([role='button'])") &&
          !["", "#"].includes(target.getAttribute("href").trim())
        ) {
          const key = JSON.stringify([
            metadata.label.toLowerCase(),
            target.href,
            ...[
              "target",
              "download",
              "data-method",
              "data-turbo-method",
              "data-turbo-frame",
            ].map((attribute) => target.getAttribute(attribute)),
          ]);
          if (seenLinks.has(key)) continue;
          seenLinks.add(key);
        }
        if (elements.length === 200)
          throw new Error(
            "This page has too many controls for browser commands.",
          );
        elements.push(metadata);
        targets.set(ref, {
          node: target,
          metadata,
          actions,
          href: target.getAttribute("href"),
          form: target.form,
          submitBehavior: this.submitBehavior(target),
          formAction: target.form?.action,
          buttonAction: target.getAttribute("formaction"),
          formMethod: target.form?.method,
          options:
            target instanceof window.HTMLSelectElement
              ? this.dropdownOptions(target).map(({ option, index }) => ({
                  ref: `o${index}`,
                  node: option,
                  value: option.value,
                }))
              : null,
        });
      }
      const selectedRef =
        this.selectedField?.url === location.href
          ? this.browserRefs.get(this.selectedField.node)
          : null;
      return {
        page: {
          page_id: window.crypto.randomUUID(),
          elements,
          ...(targets.has(selectedRef) ? { selected_ref: selectedRef } : {}),
        },
        targets,
        formState: this.activeFormState(),
        url: location.href,
      };
    }

    dynamicBrowserTarget(result) {
      const snapshot = this.browserSnapshot;
      const entry = snapshot?.targets.get(result.target);
      if (
        !this.browserActionsEnabled() ||
        !entry ||
        result.page_id !== snapshot.page.page_id ||
        snapshot.url !== location.href ||
        !entry.node.isConnected ||
        (result.selected &&
          (snapshot.page.selected_ref !== result.target ||
            this.selectedField?.node !== entry.node ||
            this.selectedField?.url !== location.href)) ||
        JSON.stringify(entry.metadata) !==
          JSON.stringify(
            this.browserControlMetadata(entry.node, result.target),
          ) ||
        entry.href !== entry.node.getAttribute("href") ||
        entry.form !== entry.node.form ||
        entry.submitBehavior !== this.submitBehavior(entry.node) ||
        entry.formAction !== entry.node.form?.action ||
        entry.formMethod !== entry.node.form?.method ||
        entry.buttonAction !== entry.node.getAttribute("formaction") ||
        !entry.actions.includes(result.action) ||
        !this.browserActionsFor(entry.node).includes(result.action)
      )
        throw new Error(
          "That control changed. Please start the command again.",
        );
      return entry.node;
    }

    submitBehavior(target) {
      return JSON.stringify([
        target.type,
        target.form?.enctype,
        target.form?.target,
        target.form?.noValidate,
        ...[
          "formmethod",
          "formenctype",
          "formtarget",
          "formnovalidate",
          "data-turbo-method",
          "data-method",
          "target",
          "download",
          "data-turbo-frame",
          "data-turbo-action",
        ].map((name) => target.getAttribute(name)),
      ]);
    }

    runBrowserAction(result) {
      if (result.action === "submit") {
        this.submitActiveForm(result);
        return;
      }
      if (result.action === "history") {
        const snapshot = this.browserSnapshot;
        if (
          !this.browserActionsEnabled() ||
          !snapshot ||
          snapshot.page.page_id !== result.page_id ||
          snapshot.url !== location.href ||
          !["back", "forward"].includes(result.direction)
        )
          throw new Error("The page changed. Please try the command again.");
        this.undoEdit = null;
        this.status.textContent = `Asked the browser to go ${result.direction}.`;
        window.history[result.direction]();
        return;
      }
      if (result.action === "scroll") {
        this.scrollPage(result);
        return;
      }
      if (
        ![
          "click",
          "fill",
          "focus",
          "select",
          "check",
          "uncheck",
          "choose",
          "clear",
          "reveal",
        ].includes(result.action)
      )
        throw new Error("This browser action is not supported.");
      let target;
      if (result.target) {
        target = this.dynamicBrowserTarget(result);
      } else {
        let targets;
        try {
          targets = document.querySelectorAll(result.selector);
        } catch {
          throw new Error("This command has an invalid element selector.");
        }
        if (targets.length !== 1)
          throw new Error(
            targets.length
              ? "More than one element matches. Use a more specific command."
              : "That element is not on this page. Open the right page first.",
          );
        target = targets[0];
      }
      if (!this.browserControlVisible(target))
        throw new Error("That element is hidden. Show it first.");
      if (target.matches(":disabled, [aria-disabled='true']"))
        throw new Error("That element is disabled.");

      if (result.action === "reveal") {
        if (!this.browserActionsFor(target).includes("reveal"))
          throw new Error("This command must target a page heading.");
        target.scrollIntoView({
          block: "center",
          behavior: this.scrollBehavior(),
        });
      } else if (["check", "uncheck", "choose"].includes(result.action)) {
        if (!this.browserActionsFor(target).includes(result.action))
          throw new Error(
            "This command must target a checkbox or radio button.",
          );
        if (result.action === "choose") {
          this.undoEdit = null;
          if (!target.checked) target.click();
        } else {
          this.changeField(target, result.action === "check");
        }
        target.focus();
      } else if (result.action === "click") {
        if (
          !this.browserActionsFor(target).includes("click") &&
          !target.matches("input[type='checkbox'], input[type='radio']")
        )
          throw new Error("This command must target a button or local link.");
        this.undoEdit = null;
        target.click();
      } else {
        const editableInput =
          target instanceof window.HTMLInputElement &&
          [
            "text",
            "search",
            "email",
            "tel",
            "url",
            "number",
            "date",
            "time",
          ].includes(target.type);
        const textarea = target instanceof window.HTMLTextAreaElement;
        const dropdown =
          target instanceof window.HTMLSelectElement && !target.multiple;
        if (!editableInput && !textarea && !dropdown)
          throw new Error("This command must target a text or number field.");
        if (target.readOnly) throw new Error("That field is read-only.");
        if (result.action === "select") {
          const option = this.browserSnapshot?.targets
            .get(result.target)
            ?.options?.find((entry) => entry.ref === result.option);
          if (
            !dropdown ||
            !option ||
            !Array.from(target.options).includes(option.node) ||
            option.node.value !== option.value ||
            !this.dropdownOptions(target).some(
              (entry) => entry.option === option.node,
            )
          )
            throw new Error("That dropdown option changed. Please try again.");
          this.changeField(
            target,
            Array.from(target.options).indexOf(option.node),
          );
        } else if (result.action === "clear") {
          if (dropdown) throw new Error("Use select for dropdown fields.");
          this.changeField(target, "");
        } else if (result.action === "fill") {
          if (dropdown) throw new Error("Use select for dropdown fields.");
          if (typeof result.value !== "string" || result.value.length > 2000)
            throw new Error("This command has an invalid field value.");
          if (target.type === "number" && result.value !== "") {
            const probe = document.createElement("input");
            probe.type = "number";
            probe.value = result.value;
            if (probe.value === "")
              throw new Error("Enter a number, for example 500 or 12.5.");
          }
          this.changeField(
            target,
            this.normalizeFieldValue(target, result.value),
          );
        }
        target.focus();
      }
      this.highlightTarget(target);
    }

    scrollBehavior() {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth";
    }

    scrollPage(result) {
      const snapshot = this.browserSnapshot;
      if (
        !this.browserActionsEnabled() ||
        !snapshot ||
        snapshot.page.page_id !== result.page_id ||
        snapshot.url !== location.href ||
        !["up", "down", "top", "bottom"].includes(result.direction)
      )
        throw new Error("The page changed. Please try the command again.");
      const behavior = this.scrollBehavior();
      if (["top", "bottom"].includes(result.direction)) {
        window.scrollTo({
          top:
            result.direction === "top"
              ? 0
              : document.scrollingElement.scrollHeight,
          behavior,
        });
      } else {
        window.scrollBy({
          top: window.innerHeight * 0.8 * (result.direction === "up" ? -1 : 1),
          behavior,
        });
      }
    }

    highlightTarget(target) {
      this.targetHighlight?.cancel();
      if (!target.isConnected || !target.animate) return;
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      this.targetHighlight = target.animate(
        [
          { outline: "3px solid #75904b", outlineOffset: "4px" },
          {
            outline: `3px solid ${reduced ? "#75904b" : "transparent"}`,
            outlineOffset: "4px",
          },
        ],
        { duration: 1200, easing: "ease-out" },
      );
    }

    normalizeFieldValue(target, value) {
      if (!["date", "time"].includes(target.type) || value === "") return value;
      let normalized = value.trim().toLowerCase();
      if (target.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const months = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ];
        const match = normalized
          .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
          .replace(/,/g, "")
          .match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
        const month = match ? months.indexOf(match[1]) : -1;
        if (month < 0)
          throw new Error("Use a date like October 1, 2026 or 2026-10-01.");
        normalized = `${match[3] || new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
      } else if (target.type === "time") {
        const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
        if (!match) throw new Error("Use a time like 14:30 or 2:30 PM.");
        let hour = Number(match[1]);
        if (
          hour > (match[3] ? 12 : 23) ||
          (match[3] && hour < 1) ||
          Number(match[2] || 0) > 59
        )
          throw new Error("Use a time like 14:30 or 2:30 PM.");
        if (match[3]) hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
        normalized = `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
      }
      const probe = document.createElement("input");
      probe.type = target.type;
      for (const attribute of ["min", "max", "step", "value"]) {
        if (target.hasAttribute(attribute))
          probe.setAttribute(attribute, target.getAttribute(attribute));
      }
      probe.value = normalized;
      if (probe.value !== normalized || !probe.validity.valid)
        throw new Error(
          "That date or time is invalid or outside the field's allowed range or step.",
        );
      return normalized;
    }

    fieldValue(target) {
      if (
        target instanceof window.HTMLInputElement &&
        target.type === "checkbox"
      )
        return target.checked;
      return target instanceof window.HTMLSelectElement
        ? target.selectedIndex
        : target.value;
    }

    writeField(target, value) {
      if (
        target instanceof window.HTMLInputElement &&
        target.type === "checkbox"
      ) {
        // Native activation updates React checked tracking and emits input/change events.
        if (target.checked !== value) target.click();
        return;
      }
      const dropdown = target instanceof window.HTMLSelectElement;
      const prototype = dropdown
        ? window.HTMLSelectElement.prototype
        : target instanceof window.HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      // Native setters let React's value tracker observe the input event.
      Object.getOwnPropertyDescriptor(
        prototype,
        dropdown ? "selectedIndex" : "value",
      ).set.call(target, value);
      target.dispatchEvent(new window.Event("input", { bubbles: true }));
      target.dispatchEvent(new window.Event("change", { bubbles: true }));
    }

    changeField(target, value) {
      const before = this.fieldValue(target);
      if (before === value) return;
      this.undoEdit = {
        node: target,
        before,
        after: value,
        url: location.href,
        form: target.form,
        metadata: JSON.stringify(this.browserControlMetadata(target, "e0")),
        options:
          target instanceof window.HTMLSelectElement
            ? Array.from(target.options, (node) => ({
                node,
                value: node.value,
              }))
            : null,
      };
      this.writeField(target, value);
    }

    canUndo() {
      const edit = this.undoEdit;
      if (
        !edit ||
        edit.url !== location.href ||
        !edit.node.isConnected ||
        edit.node.form !== edit.form ||
        this.fieldValue(edit.node) !== edit.after ||
        !this.browserControlVisible(edit.node) ||
        edit.node.matches(":disabled, [readonly], [aria-disabled='true']")
      )
        return false;
      try {
        return (
          edit.metadata ===
            JSON.stringify(this.browserControlMetadata(edit.node, "e0")) &&
          (!edit.options ||
            edit.options.every(
              (option, index) =>
                edit.node.options[index] === option.node &&
                option.node.value === option.value,
            ))
        );
      } catch {
        return false;
      }
    }

    undoLastEdit() {
      if (this.busy) return;
      const edit = this.undoEdit;
      const valid = this.canUndo();
      this.undoEdit = null;
      this.continuation = null;
      this.choices.replaceChildren();
      if (valid) {
        this.writeField(edit.node, edit.before);
        edit.node.focus();
        this.highlightTarget(edit.node);
        this.input.value = "";
      }
      this.status.textContent = valid
        ? "Undone."
        : "No unsaved field edit to undo.";
      this.touch();
      this.refreshPageTools();
    }

    refreshPageTools() {
      if (!this.shadowRoot || this.panel.hidden) return;
      let snapshot;
      try {
        if (this.browserActionsEnabled())
          snapshot = this.discoverBrowserControls();
      } catch (error) {
        this.status.textContent = error.message;
      }
      const selected = snapshot?.page.elements.find(
        (target) => target.ref === snapshot.page.selected_ref,
      );
      this.shadowRoot.querySelector(".selected-field").textContent = selected
        ? `Editing: ${selected.label}`
        : "";
      if (!this.canUndo()) this.undoEdit = null;
      const undo = this.shadowRoot.querySelector(".undo");
      undo.hidden = !this.undoEdit;
      undo.disabled = !!this.busy;
      this.shadowRoot.querySelector(".field-tools").hidden =
        !selected && !this.undoEdit;
      const suggestions = this.shadowRoot.querySelector(".suggestions");
      suggestions.replaceChildren();
      suggestions.hidden =
        !!this.continuation || !!this.busy || !this.help.hidden || !snapshot;
      if (suggestions.hidden) return snapshot;
      const candidates = [];
      const add = (target, action) => {
        if (
          target &&
          !candidates.some((candidate) => candidate.target.ref === target.ref)
        )
          candidates.push({ target, action });
      };
      if (selected) add(selected, "enter");
      const local = snapshot.page.elements.filter(
        (target) =>
          !snapshot.targets.get(target.ref).node.closest("nav, aside, header"),
      );
      add(
        local.find((target) =>
          snapshot.targets.get(target.ref).actions.includes("fill"),
        ),
        "fill",
      );
      add(
        local.find((target) =>
          snapshot.targets.get(target.ref).actions.includes("select"),
        ),
        "select",
      );
      candidates.splice(2);
      const clicks = local.filter(
        (target) =>
          snapshot.targets.get(target.ref).actions.includes("click") &&
          !/\b(delete|remove|destroy|refund|reset|sign\s*out|log\s*out)\b/i.test(
            target.label,
          ),
      );
      const save = clicks.find((target) => {
        const node = snapshot.targets.get(target.ref).node;
        return (
          node.form &&
          node.matches(
            "button[type='submit'], button:not([type]), input[type='submit']",
          )
        );
      });
      add(save, "click");
      if (!candidates.length)
        clicks.slice(0, 3).forEach((target) => add(target, "click"));
      for (const { target, action } of candidates.slice(0, 3)) {
        this.addChoice(
          `${action[0].toUpperCase() + action.slice(1)} ${target.label}`,
          () => {
            this.continuation = null;
            this.submit("", `voice_control_browser_${action}_${target.ref}`);
          },
          suggestions,
        );
      }
      suggestions.hidden = !suggestions.childElementCount;
      return snapshot;
    }

    addChoice(label, callback, container = this.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", callback);
      container.append(button);
      return button;
    }

    navigateHelp(event) {
      if (this.help.hidden || !this.help.contains(event.target)) return;
      const search = this.shadowRoot.querySelector("#search");
      const buttons = Array.from(this.help.querySelectorAll(".catalog button"));
      if (!buttons.length) return;
      if (event.key === "Enter" && event.target === search) {
        event.preventDefault();
        buttons[0].click();
      } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const index = buttons.indexOf(event.target);
        if (index === 0 && event.key === "ArrowUp") search.focus();
        else {
          const next =
            index < 0
              ? event.key === "ArrowDown"
                ? 0
                : buttons.length - 1
              : (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
          buttons[next].focus();
          buttons[next].scrollIntoView({ block: "nearest" });
        }
      }
    }

    async toggleHelp() {
      this.help.hidden = !this.help.hidden;
      this.refreshPageTools();
      if (this.help.hidden) return;
      this.renderCatalog();
      this.shadowRoot.querySelector("#search").focus();
      await this.loadCatalog();
    }

    async loadCatalog() {
      const path = location.pathname;
      const version = this.catalogVersion = (this.catalogVersion || 0) + 1;
      try {
        const result = await this.api("commands");
        if (path !== location.pathname || version !== this.catalogVersion) return;
        this.catalog = result.commands;
        this.renderCatalog();
      } catch (error) {
        if (path === location.pathname && version === this.catalogVersion)
          this.status.textContent = error.message;
      }
    }

    renderCatalog(snapshot) {
      const focusedKey = this.shadowRoot.activeElement?.dataset.commandKey;
      const commands = [...(this.catalog || [])];
      try {
        if (this.browserActionsEnabled()) {
          snapshot ||= this.discoverBrowserControls();
          for (const target of snapshot.page.elements) {
            if (target.ref === snapshot.page.selected_ref) {
              commands.push({
                key: `voice_control_browser_enter_${target.ref}`,
                group: "On this page",
                description: `Enter into selected field (${target.label})`,
                examples: ["enter <value>"],
              });
              if (snapshot.targets.get(target.ref).actions.includes("clear")) {
                commands.push({
                  key: `voice_control_browser_clear_selected_${target.ref}`,
                  group: "On this page",
                  description: `Clear selected field (${target.label})`,
                  examples: ["clear this field"],
                });
              }
            }
            for (const action of snapshot.targets.get(target.ref).actions) {
              commands.push({
                key: `voice_control_browser_${action}_${target.ref}`,
                group: "On this page",
                description:
                  action === "reveal"
                    ? `Show ${target.label} section`
                    : `${action[0].toUpperCase() + action.slice(1)} ${target.label}`,
                examples: [],
              });
            }
          }
          for (const direction of ["up", "down", "top", "bottom"]) {
            commands.push({
              key: `voice_control_browser_scroll_${direction}`,
              group: "On this page",
              description: `Scroll ${direction}`,
              examples: [],
            });
          }
          for (const direction of ["back", "forward"]) {
            commands.push({
              key: `voice_control_browser_history_${direction}`,
              group: "On this page",
              description: `Go ${direction}`,
              examples: [],
            });
          }
          commands.push({
            key: "voice_control_browser_submit",
            group: "On this page",
            description: "Submit active form",
            examples: ["submit", "submit this form"],
          });
        }
      } catch (error) {
        this.status.textContent = error.message;
      }
      const container = this.shadowRoot.querySelector(".catalog");
      const query = this.shadowRoot
        .querySelector("#search")
        .value.toLowerCase();
      container.replaceChildren();
      let group;
      for (const command of commands) {
        if (!this.matchesHelp(command, query)) continue;
        if (group !== command.group) {
          group = command.group;
          const heading = document.createElement("h3");
          heading.textContent = group;
          container.append(heading);
        }
        const button = this.addChoice(
          command.description,
          () => {
            this.continuation = null;
            this.help.hidden = true;
            this.submit("", command.key);
          },
          container,
        );
        button.dataset.commandKey = command.key;
        if (command.examples.length) {
          const example = document.createElement("small");
          example.textContent = command.examples.join(" · ");
          container.append(example);
        }
      }
      if (!container.childElementCount)
        container.textContent = "No matching commands.";
      if (focusedKey) {
        const replacement = Array.from(
          container.querySelectorAll("button"),
        ).find((button) => button.dataset.commandKey === focusedKey);
        (replacement || this.shadowRoot.querySelector("#search")).focus({
          preventScroll: true,
        });
      }
    }

    matchesHelp(command, query) {
      const normalize = (value) =>
        value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
      const text = normalize(
        [
          command.description,
          command.group,
          ...(command.aliases || []),
          ...command.examples,
        ].join(" "),
      );
      const terms =
        normalize(query.slice(0, 160)).match(/[\p{L}\p{N}]+/gu) || [];
      const words = text.match(/[\p{L}\p{N}]+/gu) || [];
      return terms.every(
        (term) =>
          text.includes(term) ||
          (term.length >= 4 &&
            term.length <= 64 &&
            words.some((word) => this.closeSpelling(term, word))),
      );
    }

    closeSpelling(left, right) {
      const limit = left.length >= 7 ? 2 : 1;
      if (right.length > 64 || Math.abs(left.length - right.length) > limit)
        return false;
      let previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index,
      );
      let beforePrevious;
      for (let i = 1; i <= left.length; i++) {
        const row = [i];
        for (let j = 1; j <= right.length; j++) {
          row[j] = Math.min(
            row[j - 1] + 1,
            previous[j] + 1,
            previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
          );
          if (
            i > 1 &&
            j > 1 &&
            left[i - 1] === right[j - 2] &&
            left[i - 2] === right[j - 1]
          )
            row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
        }
        if (Math.min(...row) > limit) return false;
        beforePrevious = previous;
        previous = row;
      }
      return previous[right.length] <= limit;
    }
  }
  customElements.define("voice-control-widget", VoiceControlWidget);
})();
