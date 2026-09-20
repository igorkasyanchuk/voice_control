import { useEffect } from "react";

// Load /lazzzy/widget.js and Rails CSRF meta tags in your HTML shell first.
export function LazzzyCommands({ navigate, userId }) {
  useEffect(() => {
    let mounted = true;
    customElements.whenDefined("lazzzy-widget").then(() => {
      if (!mounted) return;
      window.Lazzzy.configure({ navigate });
      window.Lazzzy.setContext(() => ({ area: "admin", user_id: userId }));
    });
    return () => {
      mounted = false;
    };
  }, [navigate, userId]);

  return (
    <lazzzy-widget
      id="lazzzy-widget"
      data-endpoint="/lazzzy"
      data-shortcut="mod+shift+u"
      data-idle-timeout="120000"
      data-browser-actions="true"
    />
  );
}
