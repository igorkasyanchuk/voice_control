module Lazzzy
  class BrowserActions
    MAX_TARGETS = 200
    PREFIX = "lazzzy_browser_".freeze
    SCROLL_DIRECTIONS = %w[up down top bottom].freeze
    HISTORY_DIRECTIONS = %w[back forward].freeze
    attr_reader :commands

    def initialize(page)
      unless page.is_a?(Hash) && JSON.generate(page).bytesize <= 131_072 &&
          page["page_id"].is_a?(String) && page["page_id"].match?(/\A[a-z0-9-]{1,64}\z/i) &&
          page["elements"].is_a?(Array) && page["elements"].length <= MAX_TARGETS
        raise InvalidInput, "Invalid browser controls. Reload the page and try again."
      end

      @page_id = page["page_id"]
      @targets = page["elements"].map { |target| validate_target(target) }
      raise InvalidInput, "Duplicate browser controls" unless @targets.map { |target| target["ref"] }.uniq.length == @targets.length

      @selected_ref = page["selected_ref"]
      if @selected_ref && !@targets.any? { |target| target["ref"] == @selected_ref && (target["actions"] & %w[fill select]).any? }
        raise InvalidInput, "Select an editable field first."
      end

      @command_targets = {}
      @commands = @targets.flat_map { |target| build_commands(target) } + build_scroll_commands + build_history_commands + [build_submit_command]
    end

    def snapshot(keys)
      refs = keys.filter_map { |key| @command_targets[key] }
      return if refs.empty? && keys.none? { |key|
        key == "#{PREFIX}submit" || SCROLL_DIRECTIONS.any? { |direction| key == "#{PREFIX}scroll_#{direction}" } ||
          HISTORY_DIRECTIONS.any? { |direction| key == "#{PREFIX}history_#{direction}" }
      }

      { "page_id" => @page_id, "elements" => @targets.select { |target| refs.include?(target["ref"]) },
        "selected_ref" => (@selected_ref if refs.include?(@selected_ref)) }.compact
    end

    def exact_click_matches(transcript)
      phrase = transcript.squish.downcase
      @commands.select do |command|
        command.key.start_with?("#{PREFIX}click_") &&
          command.aliases.any? { |name| name.start_with?("click ") && name.squish.downcase == phrase }
      end
    end

    class << self
      def extract_value(text, label:)
        text[/["“](.+?)["”]/, 1] ||
          text[/\A(?:fill|enter|type|set)\s+(?:the\s+)?#{Regexp.escape(label)}(?:\s+field)?\s+(?:with|to)\s+(.+)\z/i, 1] ||
          text[/\b(?:fill|set)\b.+?\b(?:with|to)\s+(.+)\z/i, 1] ||
          text[/\b(?:enter|type)\s+(.+?)\s+(?:in|into)\s+.+\z/i, 1]
      end

      def selected_value(text)
        text[/\A(?:enter|type)\s+(.+)\z/im, 1]&.sub(/\A"(.*)"\z/m, '\1')&.sub(/\A“(.*)”\z/m, '\1')
      end

      def select_value(text, label:)
        extract_value(text, label: label) ||
          text[/\A(?:select|choose)\s+(.+?)\s+(?:from|in|for)\s+(?:the\s+)?#{Regexp.escape(label)}\z/i, 1] ||
          (text[/\A(?:select|choose)\s+(.+)\z/i, 1] unless text.match?(/\A(?:select|choose)\s+#{Regexp.escape(label)}\z/i))
      end
    end

    private

    def validate_target(target)
      unless target.is_a?(Hash) && target["ref"].is_a?(String) && target["ref"].match?(/\Ae\d{1,9}\z/)
        raise InvalidInput, "Invalid browser control reference"
      end
      clean = target.slice("ref", "label", "id", "name", "tag", "type")
      unless %w[label id name tag type].all? { |key| clean[key].is_a?(String) && clean[key].length <= 160 } && clean["label"].present?
        raise InvalidInput, "Invalid browser control label"
      end
      allowed = case clean["tag"]
      when "button", "a" then %w[click]
      when "textarea" then %w[fill focus clear]
      when "h1", "h2", "h3", "h4", "h5", "h6" then %w[reveal]
      when "select"
        options = target["options"]
        unless options.is_a?(Array) && options.length.between?(1, 100) && JSON.generate(options).bytesize <= 4096 &&
            options.all? { |option| option.is_a?(Hash) && option["ref"].is_a?(String) && option["ref"].match?(/\Ao\d{1,6}\z/) && option["label"].is_a?(String) && option["label"].strip.length.between?(1, 160) }
          raise InvalidInput, "Invalid dropdown options"
        end
        clean["options"] = options.map { |option| option.slice("ref", "label") }
        if options.map { |option| option["ref"] }.uniq.length != options.length ||
            options.map { |option| option["label"].tr("_", " ").downcase }.uniq.length != options.length
          raise InvalidInput, "Dropdown options must have distinct labels."
        end
        %w[select focus]
      when "input"
        if clean["type"] == "checkbox"
          %w[check uncheck]
        elsif clean["type"] == "radio"
          %w[choose]
        elsif %w[button submit reset].include?(clean["type"])
          %w[click]
        elsif %w[text search email tel url number date time].include?(clean["type"])
          %w[fill focus clear]
        else
          []
        end
      else
        clean["type"] == "button" ? %w[click] : []
      end
      raise InvalidInput, "Unsupported browser control" if allowed.empty?

      clean.merge("actions" => allowed)
    end

    def build_commands(target)
      actions = target["actions"] + (target["ref"] == @selected_ref ? ["enter"] : [])
      actions << "clear_selected" if target["ref"] == @selected_ref && target["actions"].include?("clear")
      actions.map do |action|
        selected = %w[enter clear_selected].include?(action)
        fill = %w[fill enter].include?(action)
        key = "#{PREFIX}#{action}_#{target['ref']}"
        @command_targets[key] = target["ref"]
        next build_checked_command(target, key, action) if %w[check uncheck choose].include?(action)
        next build_dropdown_command(target, key, selected: selected) if action == "select" || (selected && target["tag"] == "select")
        label = target["label"]
        identity = [target["tag"], ("id: #{target['id']}" if target["id"].present?), ("name: #{target['name']}" if target["name"].present?)].compact.join(", ")
        result_action = { "enter" => "fill", "clear_selected" => "clear" }.fetch(action, action)
        result = { kind: "browser", action: result_action, target: target["ref"], page_id: @page_id }
        result[:selected] = true if selected
        aliases = (action == "fill" ? %w[fill enter type set] : [action]).map { |verb| "#{verb} #{label}" }
        aliases << label if action == "click" && label.match?(/\A(?:edit|delete|remove|view|open|manage)\s/i)
        aliases = ["clear this field", "clear selected field", "clear the selected field"] if action == "clear_selected"
        aliases = ["show #{label}", "show the #{label} section", "scroll to #{label}", "go to #{label} section"] if action == "reveal"
        description = if selected
          "#{action == 'enter' ? 'Enter a value into' : 'Clear'} the selected field: #{label}"
        elsif action == "reveal"
          "Show #{label} section"
        else
          "#{action.capitalize} #{label} (#{identity})"
        end
        Command.new(key, description: description, group: "On this page",
          aliases: action == "enter" ? %w[enter type] : aliases, examples: []) do
          if fill
            argument :value, :string, prompt: "What should I enter in #{label}?",
              extract: ->(text, _context) { selected ? BrowserActions.selected_value(text) : BrowserActions.extract_value(text, label: label) }
          end
          execute { |args, _context| fill ? result.merge(value: args[:value]) : result }
        end
      end
    end

    def build_dropdown_command(target, key, selected:)
      page_id = @page_id
      label = target["label"]
      options = target["options"]
      values = options.map { |option| option["label"] }
      aliases = selected ? %w[enter type] : ["set #{label}", "select #{label}", "choose #{label}"] + values.flat_map { |value| ["select #{value}", "choose #{value}"] }
      description = selected ? "Enter a choice into the selected dropdown: #{label}" : "Select #{label}"
      Command.new(key, description: description, group: "On this page", aliases: aliases) do
        argument :value, :enum, values: values,
          prompt: "Which #{label}? Choose: #{values.join(', ')}.",
          extract: ->(text, _context) { selected ? BrowserActions.selected_value(text) : BrowserActions.select_value(text, label: label) }
        execute do |args, _context|
          result = { kind: "browser", action: "select", target: target["ref"], page_id: page_id,
            option: options.find { |option| option["label"] == args[:value] }.fetch("ref") }
          result[:selected] = true if selected
          result
        end
      end
    end

    def build_checked_command(target, key, action)
      label = target["label"]
      subject = label.sub(/\A(?:enable|disable)\s+/i, "")
      verbs = { "check" => ["check", "enable", "turn on"], "uncheck" => ["uncheck", "disable", "turn off"], "choose" => ["choose", "select", "check"] }.fetch(action)
      aliases = verbs.product([label, subject].uniq).map { |verb, name| "#{verb} #{name}" }
      result = { kind: "browser", action: action, target: target["ref"], page_id: @page_id }
      Command.new(key, description: "#{action.capitalize} #{label}", group: "On this page", aliases: aliases) do
        execute { |_args, _context| result }
      end
    end

    def build_scroll_commands
      page_id = @page_id
      SCROLL_DIRECTIONS.map do |direction|
        aliases = ["scroll #{direction}", "scroll to #{direction}", "scroll to the #{direction}"]
        aliases += ["back to top", "go to top"] if direction == "top"
        Command.new("#{PREFIX}scroll_#{direction}", description: "Scroll #{direction}", group: "On this page", aliases: aliases) do
          execute { |_args, _context| { kind: "browser", action: "scroll", direction: direction, page_id: page_id } }
        end
      end
    end

    def build_history_commands
      page_id = @page_id
      HISTORY_DIRECTIONS.map do |direction|
        Command.new("#{PREFIX}history_#{direction}", description: "Go #{direction}", group: "On this page",
          aliases: ["go #{direction}", "browser #{direction}", direction]) do
          execute { |_args, _context| { kind: "browser", action: "history", direction: direction, page_id: page_id } }
        end
      end
    end

    def build_submit_command
      page_id = @page_id
      Command.new("#{PREFIX}submit", description: "Submit active form", group: "On this page",
        aliases: ["submit", "submit form", "submit this form", "submit active form", "submit this field"]) do
        execute { |_args, _context| { kind: "browser", action: "submit", page_id: page_id } }
      end
    end
  end
end
