[← README](../README.md)

# Browser context and React

The widget automatically sends `url: location.href` (including query strings and fragments) and `path: location.pathname` with each command. These are read at submission time, including after Turbo or React navigation. The backend passes this context to Jev and your action callbacks; no separate page-information command is needed. Follow-ups and execution keep the initial command’s context.

Add context once the widget has connected:

```javascript
window.VoiceControl.setContext(() => ({
  area: "admin",
  user_id: currentUserIdFromYourPage
}))
```

Custom context can override defaults. For example, use `url: location.origin + location.pathname` in `setContext` to omit query strings and fragments.

Restrict context on the server if needed:

```ruby
config.context = ->(client_context) { client_context.slice("url", "path", "area", "user_id") }
```

Browser context is **untrusted input**. It can select a candidate record, but permission checks must use the current authenticated user and that actual record. Do not send credentials, private page contents, or sensitive query parameters. Configured context and the current transcript are sent to Jev for interpretation; continuation state is signed, not encrypted, and visible to that browser.

For React, mount the web component outside the changing route subtree and load `/voice_control/widget.js` once. Keep a current Rails CSRF meta tag in the document:

```jsx
<voice-control-widget
  id="voice-control-widget"
  data-endpoint="/voice_control"
  data-shortcut="mod+shift+u"
  data-idle-timeout="120000"
  data-request-timeout="30000"
  data-browser-actions="true"
/>
```

Connect your router after the component mounts:

```javascript
window.VoiceControl.configure({ navigate: (path) => navigate(path) })
window.VoiceControl.setContext(() => ({ area: "workspace" }))
```

`window.VoiceControl.open()` and `.close()` are also available. Call `window.VoiceControl.refresh()` after your custom router changes the URL to refresh page-scoped help and dynamic controls and clear pending follow-ups. Turbo and browser history events do this automatically, even with dynamic browser actions disabled. In React, call it from an effect depending on your router's current location; await `customElements.whenDefined("voice-control-widget")` first if the script may still be loading.

Avoid replacing the widget during route changes. Removing it stops recognition and releases its listeners. Turbo layouts use the same `id` and `data-turbo-permanent`; the Rails helper sets both.

## Listening and keyboard controls

The floating button or keyboard shortcut opens the widget and starts browser speech recognition. English (`en-US`) only for now. Typing remains available when recognition is unsupported or denied. Closing the widget stops listening; two minutes of inactivity closes it automatically. No conversation history is displayed or persisted by the gem.

```ruby
config.keyboard_shortcut = "mod+shift+u" # ⌘ on macOS, Ctrl elsewhere
config.keyboard_shortcut = "ctrl+alt+l" # An alternative
config.keyboard_shortcut = nil          # Disable it
config.idle_timeout = 120_000           # Milliseconds
config.push_to_talk_shortcut = "mod+shift+space" # Hold to speak, release to submit
config.widget_position = :bottom_right # Or :bottom_left
```

**Push-to-talk:** hold Cmd+Shift+Space on macOS or Ctrl+Shift+Space elsewhere while the page has focus. It opens the widget and listens for that hold only; releasing submits finalized speech once. Closing, leaving the tab, losing window focus, or microphone failure cancels the recording. If speech is still incomplete, its draft stays in the input for review instead of executing. Set `push_to_talk_shortcut = nil` to disable it or use another modifier/key combination if the browser/OS reserves this one. The ordinary microphone toggle still supports continuous listening.

**Keyboard help:** opening help focuses search. Use ↓/↑ to move through matching command buttons and Enter to run the focused command. Enter from search runs the first match; ↑ from the first command returns to search. Focus survives catalog refreshes when the same command remains available. Escape closes the widget.

Say `close voice control` or `stop listening` to close it. Say `cancel` to abandon a pending follow-up. Choose ambiguous commands by clicking or saying `one`, `two`, or `three`. Help lists only visible commands; clicking a command runs it or asks for its missing arguments.

Only final speech results are interpreted. Recognition is paused while a request runs, so interim transcripts cannot fire a partially spoken amount. Turbo navigation preserves the widget. Full page loads, command-triggered reloads, and back/forward cache restoration restore the open/listening state from a short-lived sessionStorage flag, provided the idle window has not expired. Leaving a page releases its microphone. Closing clears that flag; a fresh visit does not start listening. Browsers can still require a fresh gesture to restart the microphone. Browser speech recognition may use the browser vendor's remote service and is not guaranteed to work offline.

Requests have a 30-second deadline including response parsing. Set `config.request_timeout` (milliseconds, 1,000–300,000) to change it. A timeout releases the busy state and aborts the browser request. It cannot cancel work already running on the server: execution timeouts ask the user to check the page before trying again. VoiceControl never automatically retries a timed-out action.

## Browser support

Typed commands require modern browsers with Custom Elements, Shadow DOM, Fetch, and `crypto.randomUUID`. Use HTTPS in deployed applications; localhost is suitable for development. Voice depends on the browser's `SpeechRecognition` or `webkitSpeechRecognition` implementation and microphone permission. It is not supported uniformly across browsers and may use a remote speech service; see the [MDN compatibility notes](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). Typing and command help remain available without voice.

Test the actual browsers and devices you intend to support. CI runs browser regressions in Chromium, Firefox, and WebKit, including real Turbo navigation. Simulated speech events do not certify microphone hardware, transcription quality, mobile behavior, or offline recognition. React hooks are provided, but a complete React application needs its own end-to-end check.

The React example assumes the script has loaded and the custom element has upgraded before calling `window.VoiceControl`. Use `customElements.whenDefined("voice-control-widget")` when script loading can race your component mount. Keep one widget per document and place it outside route content. Native input events support conventional controlled inputs; custom controls should use named application events.
