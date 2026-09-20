require_relative "test_helper"
require "rails/generators/test_case"
require "generators/lazzzy/install/install_generator"

class GeneratorTest < Rails::Generators::TestCase
  tests Lazzzy::Generators::InstallGenerator
  destination File.expand_path("../tmp/generator", __dir__)

  setup do
    prepare_destination
    FileUtils.mkdir_p(File.join(destination_root, "config"))
    File.write(File.join(destination_root, "config/routes.rb"), "Rails.application.routes.draw do\nend\n")
  end

  def test_installs_initializer_and_mount
    run_generator
    assert_file "config/initializers/lazzzy.rb", /config.authorize = -> \{ false \}/
    assert_file "config/initializers/lazzzy.rb", /JEV_API_KEY/
    assert_file "config/routes.rb", /mount Lazzzy::Engine/
  end
end
