require_relative "boot"
require "rails"
require "action_controller/railtie"
require "active_record/railtie"
require "lazzzy"
require_relative "../demo_interpreter"

module LazzzyDemo
  class Application < Rails::Application
    config.load_defaults 8.0
    config.eager_load = false
    config.secret_key_base = "lazzzy-local-demo-only-" * 5
    config.hosts = ["localhost", "127.0.0.1", "www.example.com"]
    config.cache_store = :memory_store
    config.action_controller.allow_forgery_protection = true
    config.action_dispatch.show_exceptions = :none
    config.session_store :cookie_store, key: "_lazzzy_demo"
    config.logger = Logger.new($stdout)
    config.log_level = :warn
  end
end
