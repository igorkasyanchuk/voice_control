class DemoInterpreter
  def call(transcript:, context:, commands:)
    text = transcript.downcase.strip
    target_first = text.sub(/\A(enter|type)\s+.+?\s+(?:in|into)\s+/, '\1 ')
    selected = commands.find { |command| command.examples.any? { |example| example.downcase == text } }
    selected ||= commands.filter_map do |command|
      next if command.key.start_with?("voice_control_browser_enter_") && !text.match?(/\A(?:enter|type)(?:\s|\z)/)

      matches = ([command.description] + command.aliases).select do |phrase|
        pattern = /\b#{Regexp.escape(phrase.downcase)}\b/
        text.match?(pattern) || target_first.match?(pattern)
      end
      [command, matches.map(&:length).max] if matches.any?
    end.max_by(&:last)&.first
    { command: selected&.key, confidence: 1.0, candidates: [] }
  end
end
