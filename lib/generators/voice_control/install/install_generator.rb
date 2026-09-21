require "rails/generators"

module VoiceControl
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      def create_initializer
        template "voice_control.rb", "config/initializers/voice_control.rb"
      end

      def mount_engine
        route 'mount VoiceControl::Engine => "/voice_control", as: :voice_control'
      end

      def explain_widget
        say 'Add <%= voice_control_widget %> before </body> in your layout. Configure authorization before using it.'
      end
    end
  end
end
