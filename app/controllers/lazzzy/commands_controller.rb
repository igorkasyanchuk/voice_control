module Lazzzy
  class CommandsController < Lazzzy.configuration.parent_controller.constantize
    wrap_parameters false
    protect_from_forgery with: :exception
    before_action :lazzzy_authorize
    before_action :lazzzy_no_store
    before_action :lazzzy_start_timer
    rescue_from StandardError, with: :lazzzy_error
    rescue_from Lazzzy::Forbidden, with: :lazzzy_forbidden
    rescue_from Lazzzy::InvalidInput, with: :lazzzy_invalid

    def index
      render json: { commands: conversation.catalog.map(&:as_json) }
    end

    def create
      context = params[:context]
      context = context.to_unsafe_h if context.is_a?(ActionController::Parameters)
      browser_page = params[:browser_page]
      browser_page = browser_page.to_unsafe_h if browser_page.is_a?(ActionController::Parameters)
      render_result conversation.interpret(transcript: params[:transcript] || "", client_context: context || {},
        command_key: params[:command], continuation: params[:continuation], browser_page: browser_page)
    end

    def execute
      render_result conversation.execute(params[:ticket])
    end

    private

    def lazzzy_start_timer
      @lazzzy_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def render_result(result, status: :ok)
      if Lazzzy.configuration.debug == true && @lazzzy_started_at
        result = result.merge(debug: (@conversation&.diagnostics || {}).merge(
          stage: action_name == "execute" ? "execute" : "interpret", outcome: result[:kind],
          message: result[:message], duration_ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @lazzzy_started_at) * 1000).round))
      end
      render json: result, status: status
    end

    def conversation
      @conversation ||= Conversation.new(self)
    end

    def lazzzy_authorize
      raise Forbidden unless instance_exec(&Lazzzy.configuration.authorize)
    end

    def lazzzy_no_store
      response.headers["Cache-Control"] = "no-store"
    end

    def lazzzy_forbidden
      render_result({ kind: "error", message: "You cannot run this command." }, status: :forbidden)
    end

    def lazzzy_invalid(error)
      render_result({ kind: "error", message: error.message }, status: :unprocessable_content)
    end

    def lazzzy_error(error)
      if error.is_a?(ActionController::InvalidAuthenticityToken)
        render_result({ kind: "error", message: "Your session changed. Reload the page." }, status: :unprocessable_content)
      else
        begin
          Lazzzy.configuration.on_error.call(error, { command: conversation.command_key || params[:command], controller: self })
        rescue StandardError => reporting_error
          Rails.logger.error("Lazzzy error callback failed: #{reporting_error.class}")
        end
        render_result({ kind: "error", message: "Something went wrong. Check the result before trying again." }, status: :internal_server_error)
      end
    end
  end
end
