class SettingsController < ApplicationController
  before_action :require_demo_admin
  before_action -> { @page = "settings" }

  def show
    render "demo/show"
  end

  def update
    if workspace_settings.update(params.require(:settings).permit(:workspace_name, :workspace_note, :notifications, :discount_percent))
      redirect_to settings_path, notice: "Settings saved.", status: :see_other
    else
      render "demo/show", status: :unprocessable_content
    end
  end
end
