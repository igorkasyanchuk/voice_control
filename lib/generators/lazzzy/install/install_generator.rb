require "rails/generators"

module Lazzzy
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      def create_initializer
        template "lazzzy.rb", "config/initializers/lazzzy.rb"
      end

      def mount_engine
        route 'mount Lazzzy::Engine => "/lazzzy", as: :lazzzy'
      end

      def explain_widget
        say 'Add <%= lazzzy_widget %> before </body> in your layout. Configure authorization before using it.'
      end
    end
  end
end
