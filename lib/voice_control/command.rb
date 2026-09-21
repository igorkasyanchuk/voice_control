module VoiceControl
  class Command
    attr_reader :key, :description, :group, :aliases, :examples, :arguments, :executor

    def initialize(key, description:, group:, aliases: [], examples: [], pages: nil, visible: -> { true }, authorize: ->(_args, _context) { true }, &block)
      @key, @description, @group = key, description, group
      @aliases, @examples = aliases, examples
      @visibility, @authorization = visible, authorize
      @pages = pages.nil? ? nil : Array(pages)
      if @pages && (@pages.empty? || !@pages.all? { |page| page.is_a?(Regexp) || local_path?(page) })
        raise ArgumentError, "Command pages must be local paths or regular expressions"
      end
      @arguments = []
      instance_eval(&block)
      raise ArgumentError, "Command #{key} needs an execute block" unless executor
    end

    def argument(name, type, **options)
      raise ArgumentError, "Duplicate argument: #{name}" if arguments.any? { |argument| argument.name == name.to_s }

      arguments << Argument.new(name, type, **options)
    end

    def execute(&block)
      @executor = block
    end

    def visible?(controller)
      !!controller.instance_exec(&@visibility)
    end

    def available_on?(path)
      !@pages || (local_path?(path) && @pages.any? { |page| page.is_a?(Regexp) ? page.match?(path) : page == path })
    end

    def allowed?(controller, args, context)
      visible?(controller) && !!controller.instance_exec(args, context, &@authorization)
    end

    def as_json(*)
      { key: key, description: description, group: group, aliases: aliases, examples: examples,
        arguments: arguments.map(&:as_json) }
    end

    private

    def local_path?(path)
      path.is_a?(String) && path.length <= 2_048 && path.match?(%r{\A/(?!/)[^?#\s\\]*\z})
    end
  end
end
