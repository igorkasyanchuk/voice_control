module VoiceControl
  module Result
    class << self
      def message(text, notify: nil)
        with_notification({ kind: "message", message: text.to_s }, notify)
      end

      def reload(notify: nil)
        with_notification({ kind: "reload" }, notify)
      end

      def navigate(path, notify: nil)
        path = path.to_s
        raise InvalidInput, "Navigation must use a local path" unless path.start_with?("/") && !path.start_with?("//") && !path.match?(/[\\\x00-\x20]/)

        with_notification({ kind: "navigate", url: path }, notify)
      end

      def event(name, detail = {}, notify: nil, **attributes)
        raise InvalidInput, "Invalid event name" unless name.to_s.match?(/\A[a-z][a-z0-9:_-]*\z/i)

        detail = detail.merge(attributes) unless attributes.empty?
        with_notification({ kind: "event", name: name.to_s, detail: detail }, notify)
      end

      def click(selector, notify: nil)
        with_notification(browser_action("click", selector), notify)
      end

      def fill(selector, value, notify: nil)
        value = value.to_s
        raise InvalidInput, "Field value is too long" if value.length > 2_000

        with_notification(browser_action("fill", selector).merge(value: value), notify)
      end

      def focus(selector, notify: nil)
        with_notification(browser_action("focus", selector), notify)
      end

      private

      def with_notification(result, text)
        return result if text.nil?
        raise InvalidInput, "Notifications require 1–200 characters" unless text.is_a?(String) && text.strip.length.between?(1, 200)

        result.merge(notification: text.strip)
      end

      def browser_action(action, selector)
        unless selector.is_a?(String) && !selector.strip.empty? && selector.length <= 500
          raise InvalidInput, "Browser actions require a CSS selector of 1–500 characters"
        end

        { kind: "browser", action: action, selector: selector }
      end
    end
  end
end
