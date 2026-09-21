module VoiceControl
  class CommandsController < VoiceControl.configuration.parent_controller.constantize
    wrap_parameters false
    protect_from_forgery with: :exception
    before_action :voice_control_authorize
    before_action :voice_control_no_store
    before_action :voice_control_start_timer
    rescue_from StandardError, with: :voice_control_error
    rescue_from VoiceControl::Forbidden, with: :voice_control_forbidden
    rescue_from VoiceControl::InvalidInput, with: :voice_control_invalid

    def index
      render json: { commands: conversation.catalog(page_path: params[:path]).map(&:as_json) }
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

    def voice_control_start_timer
      @voice_control_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def render_result(result, status: :ok)
      if VoiceControl.configuration.debug == true && @voice_control_started_at
        result = result.merge(debug: (@conversation&.diagnostics || {}).merge(
          stage: action_name == "execute" ? "execute" : "interpret", outcome: result[:kind],
          message: result[:message], duration_ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @voice_control_started_at) * 1000).round))
      end
      render json: result, status: status
    end

    def conversation
      @conversation ||= Conversation.new(self)
    end

    def voice_control_authorize
      raise Forbidden unless instance_exec(&VoiceControl.configuration.authorize)
    end

    def voice_control_no_store
      response.headers["Cache-Control"] = "no-store"
    end

    def voice_control_forbidden
      render_result({ kind: "error", message: "You cannot run this command." }, status: :forbidden)
    end

    def voice_control_invalid(error)
      render_result({ kind: "error", message: error.message }, status: :unprocessable_content)
    end

    def voice_control_error(error)
      if error.is_a?(ActionController::InvalidAuthenticityToken)
        render_result({ kind: "error", message: "Your session changed. Reload the page." }, status: :unprocessable_content)
      else
        begin
          VoiceControl.configuration.on_error.call(error, { command: conversation.command_key || params[:command], controller: self })
        rescue StandardError => reporting_error
          Rails.logger.error("VoiceControl error callback failed: #{reporting_error.class}")
        end
        render_result({ kind: "error", message: "Something went wrong. Check the result before trying again." }, status: :internal_server_error)
      end
    end
  end
end
