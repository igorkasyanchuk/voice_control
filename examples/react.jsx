import { useEffect } from "react";

// Load /voice_control/widget.js and Rails CSRF meta tags in your HTML shell first.
export function VoiceControlCommands({ navigate, userId, pathname }) {
  useEffect(() => {
    let mounted = true;
    customElements.whenDefined("voice-control-widget").then(() => {
      if (!mounted) return;
      window.VoiceControl.configure({ navigate });
      window.VoiceControl.setContext(() => ({ area: "admin", user_id: userId }));
      window.VoiceControl.refresh();
    });
    return () => {
      mounted = false;
    };
  }, [navigate, userId, pathname]);

  return (
    <voice-control-widget
      id="voice-control-widget"
      data-endpoint="/voice_control"
      data-shortcut="mod+shift+u"
      data-idle-timeout="120000"
      data-browser-actions="true"
    />
  );
}
