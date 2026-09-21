module VoiceControl
  class Engine < ::Rails::Engine
    isolate_namespace VoiceControl

    initializer "voice_control.helpers" do
      ActiveSupport.on_load(:action_controller_base) do
        helper VoiceControl::WidgetHelper
      end
    end
  end
end
