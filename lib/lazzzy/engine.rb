module Lazzzy
  class Engine < ::Rails::Engine
    isolate_namespace Lazzzy

    initializer "lazzzy.helpers" do
      ActiveSupport.on_load(:action_controller_base) do
        helper Lazzzy::WidgetHelper
      end
    end
  end
end
