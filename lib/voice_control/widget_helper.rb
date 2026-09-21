module VoiceControl
  module WidgetHelper
    def voice_control_widget
      return unless controller.instance_exec(&VoiceControl.configuration.authorize)

      mount = main_app.voice_control_path.chomp("/")
      version = Digest::SHA256.hexdigest(%w[widget.js widget.css].map { |name| File.binread(Engine.root.join("assets", name)) }.join)[0, 12]
      safe_join([
        tag.public_send("voice-control-widget", id: "voice-control-widget", data: {
          turbo_permanent: true, endpoint: mount, shortcut: VoiceControl.configuration.keyboard_shortcut,
          idle_timeout: VoiceControl.configuration.idle_timeout, version: version, browser_actions: VoiceControl.configuration.browser_actions,
          request_timeout: VoiceControl.configuration.request_timeout,
          debug: VoiceControl.configuration.debug == true, launcher_size: VoiceControl.configuration.launcher_size,
          position: VoiceControl.configuration.widget_position, push_to_talk_shortcut: VoiceControl.configuration.push_to_talk_shortcut,
        }),
        javascript_include_tag("#{mount}/widget.js?v=#{version}", defer: true, nonce: true),
      ])
    end
  end
end
