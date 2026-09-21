require "bigdecimal"

module VoiceControl
  class Argument
    TYPES = [:string, :integer, :decimal, :boolean, :enum].freeze
    attr_reader :name, :type, :prompt

    def initialize(name, type, required: true, default: nil, extract: nil, validate: nil, values: nil, prompt: nil)
      raise ArgumentError, "Unknown argument type: #{type}" unless TYPES.include?(type)
      raise ArgumentError, "Enum requires values" if type == :enum && (values.nil? || values.empty?)

      @name, @type, @required = name.to_s, type, required
      @default, @extractor, @validator, @values = default, extract, validate, values&.map(&:to_s)
      @prompt = prompt || "What is the #{name.to_s.tr('_', ' ')}?#{@values ? " Choose: #{@values.join(', ')}." : ''}"
    end

    def initial_value(controller, transcript, context)
      value = controller.instance_exec(transcript, context, &@extractor) if @extractor
      if value.nil?
        value = @default.respond_to?(:call) ? controller.instance_exec(transcript, context, &@default) : @default
      end
      value
    end

    def coerce(value, controller:)
      return nil if value.nil? && !@required
      raise InvalidInput, prompt if value.nil? || value.to_s.strip.empty? || value.to_s.length > 2_000

      text = value.to_s.strip
      result = case type
      when :integer
        raise ArgumentError unless text.match?(/\A[+-]?\d+\z/)
        Integer(text, 10)
      when :decimal
        raise ArgumentError unless text.match?(/\A[+-]?\d+(?:\.\d+)?\z/)
        BigDecimal(text).to_s("F")
      when :boolean
        case text.downcase
        when "true", "yes", "on" then true
        when "false", "no", "off" then false
        else raise ArgumentError
        end
      when :enum
        @values.find { |option| option.tr("_", " ").casecmp?(text.tr("_", " ")) } || (raise ArgumentError)
      else
        text
      end
      raise ArgumentError if @validator && !controller.instance_exec(result, &@validator)

      result
    rescue ArgumentError, TypeError
      raise InvalidInput, prompt
    end

    def as_json(*)
      { name: name, type: type, required: @required, values: @values, prompt: prompt }.compact
    end
  end
end
