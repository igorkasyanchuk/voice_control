require "securerandom"

module Lazzzy
  class Conversation
    attr_reader :command_key, :diagnostics

    def initialize(controller)
      @controller = controller
      @config = Lazzzy.configuration
      @diagnostics = {}
    end

    def catalog
      (@config.commands.values + (@browser_actions&.commands || [])).select { |command| command.visible?(@controller) }
    end

    def interpret(transcript:, client_context:, command_key: nil, continuation: nil, browser_page: nil)
      raise InvalidInput, "Use a command of 2,000 characters or fewer." unless transcript.is_a?(String) && transcript.length <= 2_000
      raise InvalidInput, "Context must be a small JSON object." unless client_context.is_a?(Hash) && JSON.generate(client_context).bytesize <= 4_096

      if continuation.present?
        state = unpack(continuation, "continuation")
        load_browser_actions(state["browser_page"])
        if state["candidates"]
          selected = command_key.presence || select_candidate(transcript, state["candidates"])
          return ambiguity(state) unless state["candidates"].include?(selected)

          state["command"] = selected
          state.delete("candidates")
        else
          command = fetch_command(state["command"])
          argument = command.arguments.find { |item| item.name == state["pending"] }
          raise InvalidInput, "This command changed. Please start again." unless argument

          begin
            state["arguments"][argument.name] = argument.coerce(transcript, controller: @controller)
          rescue InvalidInput
            return question(state, argument)
          end
        end
      else
        load_browser_actions(browser_page)
        context = @controller.instance_exec(client_context, &@config.context)
        raise InvalidInput, "Context must be a small JSON object." unless context.is_a?(Hash) && JSON.generate(context).bytesize <= 4_096

        state = { "id" => SecureRandom.uuid, "deadline" => 10.minutes.from_now.to_i,
          "transcript" => transcript, "context" => context.deep_stringify_keys, "arguments" => {} }
        if command_key.present?
          state["command"] = command_key
        else
          raise InvalidInput, "Say or type a command." if transcript.strip.empty?

          exact_matches = @browser_actions&.exact_click_matches(transcript) || []
          available_commands = catalog
          choice = if exact_matches.any?
            { command: exact_matches.first.key, confidence: exact_matches.one? ? 1.0 : 0.0,
              candidates: exact_matches.map(&:key), selection_source: "exact_browser_label" }
          else
            (@config.interpreter || Jev.new).call(transcript: transcript, context: context, commands: available_commands)
          end
          if @config.debug == true
            @diagnostics = { confidence: choice[:confidence], threshold: @config.confidence_threshold,
              selection_source: choice[:selection_source] || "interpreter",
              command_count: available_commands.length, matched_command: available_commands.find { |item| item.key == choice[:command] }&.key,
              matched_description: available_commands.find { |item| item.key == choice[:command] }&.description,
              candidates: Array(choice[:candidates]).select { |key| available_commands.any? { |item| item.key == key } }.first(3) }
            if choice[:jev_result]
              @diagnostics[:jev_result] = choice[:jev_result]
              probabilities = choice[:jev_result].fetch(:probabilities, {})
              @diagnostics[:command_labels] = available_commands.filter_map do |command|
                [command.key, command.description] if probabilities.key?(command.key)
              end.to_h
            end
            @diagnostics[:candidate_details] = @diagnostics[:candidates].map do |key|
              { command: key, description: available_commands.find { |item| item.key == key }.description,
                probability: choice.dig(:jev_result, :probabilities, key) }.compact
            end
          end
          raise InvalidInput, "No matching command. Open help to see what's available." unless choice[:command]

          if exact_matches.many? || choice.fetch(:confidence) < @config.confidence_threshold
            state["candidates"] = Array(choice[:candidates]).select { |key| available_commands.any? { |command| command.key == key } }.first(3)
            raise InvalidInput, "No matching command." if state["candidates"].empty?

            return ambiguity(state)
          end
          state["command"] = choice[:command]
        end
      end
      prepare(state)
    end

    def execute(ticket)
      state = unpack(ticket, "execution")
      load_browser_actions(state["browser_page"])
      command = fetch_command(state["command"])
      args = validate_arguments(command, state["arguments"])
      raise Forbidden unless command.allowed?(@controller, args, state["context"])

      store = @config.execution_store.call
      if store.is_a?(ActiveSupport::Cache::NullStore)
        raise Error, "Lazzzy needs an execution cache supporting atomic writes"
      end
      claimed = store.write("lazzzy/executions/#{state.fetch('id')}", true, unless_exist: true, expires_in: 11.minutes)
      raise InvalidInput, "This command was already submitted. Check its result before issuing another command." unless claimed

      result = @controller.instance_exec(args, state["context"], &command.executor)
      unless result.is_a?(Hash) && %w[message navigate event browser].include?(result[:kind])
        raise Error, "Commands must return a Lazzzy::Result"
      end
      Result.navigate(result.fetch(:url)) if result[:kind] == "navigate"
      result
    end

    private

    def load_browser_actions(page)
      raise Forbidden if page && !@config.browser_actions

      @browser_actions = page ? BrowserActions.new(page) : nil
    end

    def remember_browser_actions(state, keys)
      state["browser_page"] = @browser_actions&.snapshot(keys)
    end

    def prepare(state)
      command = fetch_command(state["command"])
      remember_browser_actions(state, [command.key])
      command.arguments.each do |argument|
        unless state["arguments"].key?(argument.name)
          state["arguments"][argument.name] = argument.initial_value(@controller, state["transcript"], state["context"])
        end
        begin
          state["arguments"][argument.name] = argument.coerce(state["arguments"][argument.name], controller: @controller)
        rescue InvalidInput
          return question(state, argument)
        end
      end
      args = state["arguments"].symbolize_keys
      raise Forbidden unless command.allowed?(@controller, args, state["context"])

      state.delete("pending")
      { kind: "execute", ticket: pack(state, "execution"), message: command.description }
    end

    def validate_arguments(command, values)
      command.arguments.to_h do |argument|
        [argument.name.to_sym, argument.coerce(values[argument.name], controller: @controller)]
      end
    end

    def question(state, argument)
      state["pending"] = argument.name
      { kind: "question", message: argument.prompt, continuation: pack(state, "continuation") }
    end

    def ambiguity(state)
      remember_browser_actions(state, state["candidates"])
      candidates = state["candidates"].filter_map do |key|
        command = catalog.find { |item| item.key == key }
        { key: key, description: command.description } if command&.visible?(@controller)
      end
      { kind: "ambiguous", message: "Which command? Say a number or choose one.", candidates: candidates,
        continuation: pack(state, "continuation") }
    end

    def select_candidate(transcript, keys)
      numbers = { "one" => 1, "first" => 1, "two" => 2, "second" => 2, "three" => 3, "third" => 3 }
      text = transcript.downcase.strip.delete_suffix(".")
      index = numbers[text] || (text.match?(/\A[1-3]\z/) ? text.to_i : 0)
      keys[index - 1] if index.positive?
    end

    def fetch_command(key)
      command = catalog.find { |item| item.key == key }
      raise Forbidden unless command&.visible?(@controller)

      @command_key = command.key
      @diagnostics[:command] = command.key if @config.debug == true
      command
    end

    def verifier
      Rails.application.message_verifier("lazzzy")
    end

    def purpose(kind)
      @controller.session[:lazzzy_nonce] ||= SecureRandom.hex(24)
      identity = @controller.instance_exec(&@config.identity)
      "lazzzy/#{kind}/#{@controller.session[:lazzzy_nonce]}/#{identity}"
    end

    def pack(state, kind)
      token = verifier.generate(state, purpose: purpose(kind), expires_in: 10.minutes)
      raise InvalidInput, "This command is too large. Shorten the command or page context and try again." if token.bytesize > 32_768

      token
    end

    def unpack(token, kind)
      raise InvalidInput, "Command expired. Please start again." unless token.is_a?(String) && token.bytesize <= 32_768

      state = verifier.verified(token, purpose: purpose(kind))
      unless state.is_a?(Hash) && state["deadline"].is_a?(Integer) && state["deadline"] > Time.current.to_i
        raise InvalidInput, "Command expired. Please start again."
      end
      state
    end
  end
end
