(async () => {
  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
  const fixture = document.querySelector("#fixture");
  let widget;
  const setup = async (html = "") => {
    widget?.remove();
    await wait();
    fixture.innerHTML = html;
    widget = document.createElement("voice-control-widget");
    widget.dataset.endpoint = "../../assets";
    widget.dataset.browserActions = "true";
    widget.dataset.shortcut = "ctrl+alt+l";
    fixture.append(widget);
    widget.open(false);
  };
  test("Cancel prevents an outstanding interpretation from executing", async () => {
    await setup();
    let respond;
    let executions = 0;
    widget.api = (path) =>
      path === "interpret"
        ? new Promise((resolve) => {
            respond = resolve;
          })
        : (executions++,
          Promise.resolve({ kind: "message", message: "Executed" }));
    const pending = widget.submit("run something");
    await widget.submit("cancel");
    respond({ kind: "execute", ticket: "test" });
    await pending;
    assert(executions === 0, "Canceled interpretation still executed");
    assert(
      widget.status.textContent.includes("cancel"),
      "Cancellation feedback was overwritten",
    );
  });
  test("Continuous speech waits for subsequent interim words", async () => {
    await setup();
    const original = window.SpeechRecognition;
    window.SpeechRecognition = class {
      start() {}
      abort() {}
    };
    try {
      widget.startMicrophone();
      const submitted = [];
      widget.submit = async (text) => submitted.push(text);
      const result = (text, isFinal) => {
        const item = [{ transcript: text }];
        item.isFinal = isFinal;
        widget.recognition.onresult({ resultIndex: 0, results: [item] });
      };
      result("give user 42", true);
      result("100 tokens", false);
      await wait(650);
      assert(
        submitted.length === 0,
        "Interim speech allowed a partial command to execute",
      );
      result("100 tokens", true);
      await wait(650);
      assert(
        submitted[0] === "give user 42 100 tokens",
        "Final speech was not combined",
      );
    } finally {
      widget.stopMicrophone();
      window.SpeechRecognition = original;
    }
  });
  test("A browser click rejects a changed form owner", async () => {
    await setup(
      '<form id="one"><button id="save">Save</button></form><form id="two"></form>',
    );
    const button = fixture.querySelector("#save");
    let clicks = 0;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      clicks++;
    });
    widget.browserSnapshot = widget.discoverBrowserControls();
    const ref = widget.browserSnapshot.page.elements.find(
      (item) => item.id === "save",
    ).ref;
    button.setAttribute("form", "two");
    let rejected = false;
    try {
      widget.runBrowserAction({
        action: "click",
        target: ref,
        page_id: widget.browserSnapshot.page.page_id,
      });
    } catch {
      rejected = true;
    }
    assert(rejected && clicks === 0, "Click submitted a different form");
  });
  test("A removed and reinserted widget restores its keyboard shortcut", async () => {
    await setup();
    widget.close();
    widget.remove();
    await wait();
    fixture.append(widget);
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "l",
        ctrlKey: true,
        altKey: true,
      }),
    );
    assert(
      !widget.panel.hidden,
      "Reinserted widget lost its shortcut listener",
    );
    widget.stopMicrophone();
  });
  test("Submit respects validation and preserves the submitter", async () => {
    await setup(
      '<form><input id="name" required><button name="intent" value="save">Save</button></form>',
    );
    const form = fixture.querySelector("form");
    const field = fixture.querySelector("#name");
    let submitted;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted = event.submitter;
    });
    field.focus();
    widget.input.focus();
    const run = () => {
      widget.browserSnapshot = widget.discoverBrowserControls();
      widget.runBrowserAction({
        action: "submit",
        page_id: widget.browserSnapshot.page.page_id,
      });
    };
    let rejected = false;
    try {
      run();
    } catch {
      rejected = true;
    }
    assert(rejected && !submitted, "Invalid form was submitted");
    field.value = "Alex";
    run();
    assert(submitted?.value === "save", "Submitter value was lost");
  });
  test("Jev debug JSON survives execution and renders as text", async () => {
    await setup();
    widget.dataset.debug = "true";
    widget.showDebug({
      jev_result: {
        choice: "home",
        confidence: 0.9,
        probabilities: { home: 0.9 },
      },
      candidate_details: [{ description: "<img src=x>" }],
    });
    widget.showDebug({ stage: "execute", outcome: "navigate" });
    const report = widget.shadowRoot.querySelector(".debug pre");
    assert(
      report.textContent.includes('"confidence": 0.9'),
      "Provider answer disappeared",
    );
    assert(!report.querySelector("img"), "Debug text became HTML");
  });
  test("Discovery requires readable labels instead of IDs or invented names", async () => {
    await setup(`
      <a href="/" id="internal-uuid"><svg><title>Decorative icon</title></svg></a>
      <button name="internal-action">↗</button>
      <button><span hidden>Hidden name</span><span aria-hidden="true">menu</span></button>
      <input name="internal-field" value="Private value">
      <a href="/" aria-label="Account"><svg></svg></a>
      <a href="/"><img alt="Help center"></a>
      <a href="/">Home <span hidden>Hidden detail</span></a>
      <label for="display-name">Display name</label><input id="display-name">
      <button title="Settings">⚙</button>
      <button data-voice-control-label="Menu">☰</button>
    `);
    const labels = widget
      .discoverBrowserControls()
      .page.elements.map((item) => item.label);
    assert(
      JSON.stringify(labels) ===
        JSON.stringify([
          "Account",
          "Help center",
          "Home",
          "Display name",
          "Settings",
          "Menu",
        ]),
      `Unexpected labels: ${labels.join(", ")}`,
    );
  });
  test("Unlabeled controls do not consume the discovery limit", async () => {
    await setup(`${"<button>↗</button>".repeat(201)}<button>Save</button>`);
    const elements = widget.discoverBrowserControls().page.elements;
    assert(
      elements.length === 1 && elements[0].label === "Save",
      "Unlabeled controls entered the catalog",
    );
  });
  test("Debug probabilities show readable names without merging duplicate labels", async () => {
    await setup();
    widget.dataset.debug = "true";
    widget.showDebug({
      command_labels: {
        voice_control_browser_click_e1: "Click Home",
        voice_control_browser_click_e2: "Click Home",
      },
      jev_result: {
        probabilities: {
          voice_control_browser_click_e1: 0.8,
          voice_control_browser_click_e2: 0.2,
          none: 0,
        },
      },
    });
    const report = widget.shadowRoot.querySelector(".debug pre").textContent;
    assert(
      report.includes('"Click Home [voice_control_browser_click_e1]": 0.8'),
      "First action has no readable description",
    );
    assert(
      report.includes('"Click Home [voice_control_browser_click_e2]": 0.2'),
      "Duplicate label lost its probability",
    );
    assert(
      widget.debugDetails.jev_result.probabilities.voice_control_browser_click_e1 ===
        0.8,
      "Raw provider result was changed",
    );
  });
  test("Small launcher keeps the panel size and a 44px click target", async () => {
    await setup();
    const stylesheet = widget.shadowRoot.querySelector("link");
    if (!stylesheet.sheet) {
      await new Promise((resolve, reject) => {
        stylesheet.addEventListener("load", resolve, { once: true });
        stylesheet.addEventListener("error", reject, { once: true });
      });
    }
    const launcher = widget.shadowRoot.querySelector(".launcher");
    const icon = launcher.querySelector("svg");
    const panelWidth = widget.panel.getBoundingClientRect().width;
    assert(
      launcher.getBoundingClientRect().width === 56,
      "Default launcher changed",
    );
    widget.dataset.launcherSize = "small";
    assert(
      launcher.getBoundingClientRect().width === 44 &&
        launcher.getBoundingClientRect().height === 44,
      "Small click target is incorrect",
    );
    assert(
      icon.getBoundingClientRect().width === 20,
      "Microphone did not shrink",
    );
    assert(
      widget.panel.getBoundingClientRect().width === panelWidth,
      "Panel width changed",
    );
  });
  test("Equivalent links ignore label case and retain stale-node checks", async () => {
    await setup(
      '<a href="/characters/new">Create Character</a><a href="/characters/new">create character</a><a href="/characters/new">CREATE CHARACTER</a>',
    );
    const links = fixture.querySelectorAll("a");
    const clicked = [];
    links.forEach((link, index) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        clicked.push(index);
      }),
    );
    widget.browserSnapshot = widget.discoverBrowserControls();
    assert(
      widget.browserSnapshot.page.elements.length === 1,
      "Duplicate links reached the command catalog",
    );
    const action = {
      action: "click",
      target: widget.browserSnapshot.page.elements[0].ref,
      page_id: widget.browserSnapshot.page.page_id,
    };
    widget.runBrowserAction(action);
    assert(
      clicked.join() === "0",
      "Click did not use exactly one representative",
    );
    links[0].remove();
    let rejected = false;
    try {
      widget.runBrowserAction(action);
    } catch {
      rejected = true;
    }
    assert(
      rejected && clicked.length === 1,
      "Removed representative silently switched targets",
    );
    widget.browserSnapshot = widget.discoverBrowserControls();
    assert(
      widget.browserSnapshot.page.elements.length === 1,
      "Rediscovery kept duplicate links",
    );
    widget.runBrowserAction({
      action: "click",
      target: widget.browserSnapshot.page.elements[0].ref,
      page_id: widget.browserSnapshot.page.page_id,
    });
    assert(
      clicked.join() === "0,1",
      "Rediscovery did not select the remaining link",
    );
  });
  test("Distinct link destinations and behaviors remain separate", async () => {
    await setup(`
      <a href="/users">Open</a><a href="/users?active=true">Open</a><a href="/users#active">Open</a>
      <a href="/users" target="_blank">Open</a><a href="/users" download>Open</a>
      <a href="/users" data-turbo-method="delete">Open</a><a href="/users" data-turbo-frame="preview">Open</a>
      <button>Open</button><button>Open</button><a href="#">Open</a><a href="#">Open</a>
      <a href="/users" role="button">Open</a><a href="/users" role="button">Open</a>
    `);
    assert(
      widget.discoverBrowserControls().page.elements.length === 13,
      "Distinct actions were merged",
    );
  });
  test("Duplicate links do not consume the discovery limit", async () => {
    await setup(
      `${'<a href="/users">Users</a>'.repeat(201)}<a href="/reports">Reports</a>`,
    );
    const elements = widget.discoverBrowserControls().page.elements;
    assert(elements.length === 2, "Duplicate links consumed the catalog limit");
  });
  test("Successful reload results refresh the current document", async () => {
    await setup();
    const frame = document.createElement("iframe");
    frame.src = "reload.html?plan=premium#account";
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Page did not reload")),
          3000,
        );
        frame.addEventListener("load", () => {
          if (frame.contentDocument.body.dataset.reloaded === "true") {
            clearTimeout(timeout);
            resolve();
          }
        });
        fixture.append(frame);
      });
      assert(
        frame.contentWindow.location.search === "?plan=premium",
        "Reload lost the query",
      );
      assert(
        frame.contentWindow.location.hash === "#account",
        "Reload lost the fragment",
      );
    } finally {
      frame.remove();
    }
  });
  let failures = 0;
  for (const { name, run } of tests) {
    const row = document.createElement("li");
    try {
      await run();
      row.textContent = `PASS: ${name}`;
    } catch (error) {
      failures++;
      row.textContent = `FAIL: ${name}: ${error.message}`;
    }
    document.querySelector("#results").append(row);
  }
  widget?.remove();
  document.querySelector("#summary").textContent =
    `${tests.length - failures}/${tests.length} passed; ${failures} failures`;
})();
