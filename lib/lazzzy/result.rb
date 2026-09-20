module Lazzzy
  module Result
    class << self
      def message(text)
        { kind: "message", message: text.to_s }
      end

      def navigate(path)
        path = path.to_s
        raise InvalidInput, "Navigation must use a local path" unless path.start_with?("/") && !path.start_with?("//") && !path.match?(/[\\\x00-\x20]/)

        { kind: "navigate", url: path }
      end

      def event(name, detail = {})
        raise InvalidInput, "Invalid event name" unless name.to_s.match?(/\A[a-z][a-z0-9:_-]*\z/i)

        { kind: "event", name: name.to_s, detail: detail }
      end

      def click(selector)
        browser_action("click", selector)
      end

      def fill(selector, value)
        value = value.to_s
        raise InvalidInput, "Field value is too long" if value.length > 2_000

        browser_action("fill", selector).merge(value: value)
      end

      def focus(selector)
        browser_action("focus", selector)
      end

      private

      def browser_action(action, selector)
        unless selector.is_a?(String) && !selector.strip.empty? && selector.length <= 500
          raise InvalidInput, "Browser actions require a CSS selector of 1–500 characters"
        end

        { kind: "browser", action: action, selector: selector }
      end
    end
  end
end
