source "https://rubygems.org"
gemspec
gem "railties", ENV.fetch("RAILS_VERSION", ">= 8.0"), "< 9"
gem "actionpack", ENV.fetch("RAILS_VERSION", ">= 8.0"), "< 9"
# Rails 8.0 still passes quirks_mode, removed by JSON 3.
gem "json", "< 3" if ENV["RAILS_VERSION"]&.include?("8.0")
gem "minitest", ">= 6"
gem "rake"
gem "puma"
gem "webmock"
gem "rubocop", require: false
gem "turbo-rails"
gem "rubocop-shopify", require: false
gem "activerecord", ENV.fetch("RAILS_VERSION", ">= 8.0"), "< 9"
gem "sqlite3", ">= 2.1"
