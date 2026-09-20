[← README](../README.md)

# Click buttons and fill fields

Enable automatic browser actions with one option:

```ruby
Lazzzy.configure do |config|
  config.browser_actions = true
end
```

No per-element Ruby commands are needed. Before each new command, the widget discovers the current document's visible, enabled buttons, local links, editable text and number fields, textareas, native checkboxes and radio buttons, and native single-select dropdowns. It sends their labels, IDs, names, element types, and temporary references to the server. Jev chooses the action and target alongside your Ruby vocabulary. Elements without IDs work too. Help includes these controls under **On this page** and refreshes automatically after Turbo navigation, browser history changes, and DOM updates such as React renders. Refreshes are debounced while the widget is visible; reopening help also discovers the current controls. Discovered labels omit emoji, decorative symbols, and icon markup while preserving words and readable punctuation. Controls must have readable text or a label: `data-lazzzy-label`, an accessible/associated label, image alt text, a button caption, placeholder, or title. Unlabeled and decoration-only controls are excluded; HTML IDs/names and invented “Control 28” labels are never used as fallback names. Add `aria-label="Open menu"` to make an icon-only button discoverable. The dummy app enables this option and has no hardcoded commands for its buttons or fields.

Try “click Save settings,” “focus workspace name,” or “enter Studio North into workspace name.” Text entry accepts quoted values, `fill … with …`, `set … to …`, and `enter/type … into …`. When no value is supplied, the widget asks a follow-up. Jev selects the control; deterministic extraction or the follow-up supplies the text.

An exact **“click <label>”** match uses the discovered page control directly, ignoring case and extra whitespace. It bypasses Jev so an explicit button/link name cannot be replaced with an unrelated model guess. Duplicate labels ask you to choose; other phrasing still uses the configured interpreter. Authorization, signed tickets, and stale-control checks apply to both paths.

Field entry accepts **fill**, **enter**, **type**, and **set** as aliases. Try “enter token balance with 500”, “enter 500 into token balance”, or “set token balance to 500”. Say “enter token balance” without a value to get a follow-up question. Submit the form separately with “click Save user”.

Click an editable field, then open the widget and say **“enter 500”** or **“type Hello”** to replace the selected field’s value without naming it. The widget remembers the field while you use its command box. Help shows **Enter into selected field (field label)** only when an eligible field is selected; clicking that action asks for a value. Selecting another page control or navigating clears the selection, and stale or unsupported targets are rejected.

Native dropdowns support **“select Premium from Plan”**, **“select Inactive”**, and **“set Plan to Premium”**. Say “select Plan” for a follow-up choice. Only enabled options can be selected. Option labels and opaque references are sent, never their underlying values or current selection. Dropdown catalogs must have distinct readable labels, at most 100 options, and fit within 4KB. Custom comboboxes and multi-selects are not included.

The widget shows **Editing: field name** and up to three clickable suggestions from the current page. Suggestions prioritize fields and save buttons, refresh after navigation, and use the normal command execution flow.

Say **“check notifications”**, **“enable notifications”**, or **“turn on notifications”** to check a checkbox; **“uncheck notifications”**, **“disable notifications”**, or **“turn off notifications”** to clear it. Repeating a command keeps the requested state. Radio buttons support **“choose Inactive”** or **“select Inactive”** and use the browser's normal group selection. These controls emit native click/input/change events. Try the checkbox on Settings and status radios on a user edit page, then save the form to persist your changes.

Say **“clear Token balance”** to empty a text or number field, or **“clear this field”** after selecting it. Clearing uses the same native events and Undo as filling. Passwords, read-only fields, and dropdowns are excluded. A brief green outline marks the affected control after an action or Undo, without changing the host page's styles. Reduced-motion preferences are respected.

Say **“scroll down”**, **“scroll up”**, **“back to top”**, or **“scroll to the bottom”** to move around the document. Visible HTML headings are discovered as section destinations: **“show the Billing section”** or **“scroll to Billing”** scrolls to a heading named Billing. Scrolling uses the same signed command flow, rejects a changed page, and preserves unsaved Undo. Nested scroll containers are not targeted by the directional commands.

Say **“go back”** or **“go forward”** to use the current tab's native browser history. These commands appear in help when browser actions are enabled and use the same authorization, signed tickets, and page checks. Turbo and client-side routers receive normal history navigation. As with the browser's own buttons, nothing happens if there is no corresponding history entry; a history entry may point outside the current app.

Say **“submit”** or **“submit this form”** to submit the form containing the last field or button you selected. The widget remembers that form while you type a command. Without a selection, it uses the only visible form; with multiple forms, select a field first. Native validation and submit events still run, including Turbo and React handlers, and the first submit button's name/value are preserved. Hidden, disabled, ignored, changed, and external-destination forms are rejected. A standalone input needs a native form to support submission. Submission clears that form's unsaved Undo when a submit event fires; it does not add an undo for saved data.

Help search accepts partial labels and small spelling mistakes such as **“notifcations”**. This matching runs locally and filters help only; it does not change how Jev selects or executes commands.

Native **date** and **time** fields support fill, focus, clear, selected-field entry, and Undo. Try **“set due date to October 1”**, **“set due date to 2026-10-01”**, or **“set start time to 2:30 PM”**. English month names use the browser's current year when omitted. Times accept 24-hour `14:30` or AM/PM notation. Invalid calendar dates, times, and values outside the field's min/max/step leave the old value intact. The Orders demo page includes unsaved practice fields. Date-time, month, week, and custom date-picker controls are not included.

Generic table-row actions such as **Edit** or **Delete** gain context from a visible row header or the first identity cell: **“edit Alex Morgan”** can distinguish it from another row's Edit button. The widget prefers primary link/strong text and excludes secondary small text, ignored/hidden content, and input values. Explicit `aria-label`, `aria-labelledby`, and `data-lazzzy-label` names take precedence. A changed identity invalidates an in-flight action. If a row has no usable identity, supply an explicit accessible label.

Say **“undo that”** or click **Undo** to restore the last Lazzzy field fill, dropdown selection, or checkbox change. Undo is one level, local to the current page, and dispatches the same input/change events as editing. It expires after a conflicting manual edit, form submission, navigation, radio selection, or another completed non-field action. It does not reverse saved database changes or radio-group changes. Previous values stay only in widget memory and are never sent to the backend.

### Debug mode

Enable diagnostics in your initializer and restart Rails:

```ruby
config.debug = true
```

Debug is off by default. When enabled, expand **Command details** below the widget input to inspect the latest phrase, matched command and description, selection source, confidence, confidence threshold, readable candidates, available command count, HTTP status, server interpretation/execution times in milliseconds, and outcome. **Jev result** shows the provider's validated action answer as JSON: choice, confidence, and probabilities for offered commands (including `none`). Unexpected provider metadata is excluded. The result remains available after execution and in **Copy details**. Exact label matches show `exact_browser_label` as their source and do not call Jev; their confidence is a deterministic match score. Help selections also bypass interpretation and therefore have no confidence score. Expected rejection messages appear here too; internal exceptions, credentials, execution tickets, and page context are excluded. The current phrase is displayed locally and replaced by the next command; no history is stored. Existing widget authorization still applies. The local dummy app enables debug so you can try it immediately.

Use **Copy details** to copy exactly the displayed report to your clipboard for a bug report. It includes the displayed phrase; review it before sharing. If clipboard access is unavailable, the widget offers manual copying. Nothing is uploaded or sent automatically.

Discovery excludes password, file, hidden, disabled, read-only, and unsupported input types, plus the widget itself. Current field values, HTML, and link destinations are not sent. Button captions count as labels. Add `data-lazzzy-ignore` to a control or subtree to exclude it, or `data-lazzzy-label="Save profile"` to give a control a clearer name. Labels are sent to Jev when enabled, so exclude sections whose labels contain private information. Discovery is limited to 200 eligible controls and a 128KB request; larger pages report an error rather than silently omitting controls. Iframes and other shadow roots are not scanned.

Actions stay bound to the original DOM element and page snapshot across follow-ups. Removed, replaced, relabeled, hidden, disabled, or changed-page controls are rejected. Jev returns a choice from the discovered controls, never generated JavaScript or a CSS selector. Normal server authorization and signed execution tickets apply; the underlying app remains responsible for authorizing any requests its controls initiate. This feature is off by default.

You can also register explicit browser actions in the Ruby vocabulary when you want fixed targets:

```ruby
config.group "Page controls" do
  config.command :fill_name, description: "Fill the workspace name field" do
    argument :value, :string, prompt: "What name should I enter?"
    execute { |args, _context| Lazzzy::Result.fill("#workspace-name", args[:value]) }
  end

  config.command :save_settings, description: "Click the Save settings button" do
    execute { |_args, _context| Lazzzy::Result.click("#save-settings") }
  end
end
```

For explicit commands, add an `extract` callback to accept a value in the initial command or let the widget ask a follow-up.

Explicit selectors must match exactly one visible, enabled element. Click supports buttons (including `role="button"`), checkboxes, radio buttons, and same-origin HTTP links; fill and focus support editable text/number inputs and textareas. Missing, ambiguous, hidden, disabled, and read-only targets produce feedback. A page URL change while the request is in progress cancels the browser action.

Filling replaces the value and dispatches bubbling `input` and `change` events using the native value setter for React listeners. Clicking uses the element's normal click handler and browser form validation. For custom comboboxes, multi-select controls, or other JavaScript behavior, return a named `Result.event` and handle it in your app.


Debug probabilities show readable command descriptions alongside their internal IDs, so duplicate labels remain distinguishable. IDs such as `lazzzy_browser_click_e28` identify controls for execution; they are not spoken command names.
