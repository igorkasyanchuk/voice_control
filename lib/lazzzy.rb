require "rails"
require "action_controller/railtie"
require "lazzzy/version"
require "lazzzy/argument"
require "lazzzy/command"
require "lazzzy/configuration"
require "lazzzy/result"
require "lazzzy/jev"
require "lazzzy/browser_actions"
require "lazzzy/conversation"
require "lazzzy/widget_helper"
require "lazzzy/engine"

module Lazzzy
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
