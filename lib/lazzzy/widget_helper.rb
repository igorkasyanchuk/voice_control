module Lazzzy
  module WidgetHelper
    def lazzzy_widget
      return unless controller.instance_exec(&Lazzzy.configuration.authorize)

      mount = main_app.lazzzy_path.chomp("/")
      version = Digest::SHA256.hexdigest(%w[widget.js widget.css].map { |name| File.binread(Engine.root.join("assets", name)) }.join)[0, 12]
      safe_join([
        tag.public_send("lazzzy-widget", id: "lazzzy-widget", data: {
          turbo_permanent: true, endpoint: mount, shortcut: Lazzzy.configuration.keyboard_shortcut,
          idle_timeout: Lazzzy.configuration.idle_timeout, version: version, browser_actions: Lazzzy.configuration.browser_actions,
          debug: Lazzzy.configuration.debug == true,
          position: Lazzzy.configuration.widget_position, push_to_talk_shortcut: Lazzzy.configuration.push_to_talk_shortcut,
        }),
        javascript_include_tag("#{mount}/widget.js?v=#{version}", defer: true, nonce: true),
      ])
    end
  end
end
