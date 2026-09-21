require_relative "lib/voice_control/version"

Gem::Specification.new do |spec|
  spec.name = "voice_control"
  spec.version = VoiceControl::VERSION
  spec.authors = ["Igor Kasyanchuk"]
  spec.summary = "Speak to your Rails app. Your commands, your permissions."
  spec.description = "A database-free Rails engine for voice and typed commands, with Jev routing, a Ruby vocabulary, and an isolated web component."
  spec.license = "MIT"
  spec.homepage = "https://github.com/igorkasyanchuk/voice_control"
  spec.metadata["source_code_uri"] = "https://github.com/igorkasyanchuk/voice_control"
  spec.metadata["bug_tracker_uri"] = "https://github.com/igorkasyanchuk/voice_control/issues"
  spec.metadata["changelog_uri"] = "https://github.com/igorkasyanchuk/voice_control/blob/main/CHANGELOG.md"
  spec.required_ruby_version = ">= 3.2"
  spec.metadata["rubygems_mfa_required"] = "true"
  spec.files = Dir["{app,assets,config,lib,examples,docs}/**/*", "README.md", "LICENSE", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md"].select { |path| File.file?(path) && !path.end_with?(".png") }
  spec.add_dependency "railties", ">= 8.0", "< 9"
  spec.add_dependency "actionpack", ">= 8.0", "< 9"
  spec.add_dependency "json", ">= 2.3", "< 3"
  spec.add_dependency "net-http", ">= 0.3.2", "< 1"
end
