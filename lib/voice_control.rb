require "rails"
require "action_controller/railtie"
require "voice_control/version"
require "voice_control/argument"
require "voice_control/command"
require "voice_control/configuration"
require "voice_control/result"
require "voice_control/jev"
require "voice_control/browser_actions"
require "voice_control/conversation"
require "voice_control/widget_helper"
require "voice_control/engine"

module VoiceControl
  class Error < StandardError; end
  class Forbidden < Error; end
  class InvalidInput < Error; end
  class ProviderError < Error; end

  class << self
    def configuration
      @configuration ||= Configuration.new
    end

    def configure
      yield configuration
    end
  end
end
