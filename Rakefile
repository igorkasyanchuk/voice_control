require "bundler/setup"
require "rake/testtask"
task :prepare_test_database do
  sh({ "RAILS_ENV" => "test" }, RbConfig.ruby, "test/dummy/bin/rails", "db:prepare")
end
Rake::TestTask.new do |test|
  test.libs << "test"
  test.pattern = "test/**/*_test.rb"
end
task test: :prepare_test_database
task default: :test
