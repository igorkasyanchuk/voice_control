class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  helper_method :demo_account, :workspace_settings, :demo_user_count

  def demo_admin?
    request.headers["X-Demo-Role"] != "guest"
  end

  def demo_account
    @demo_account ||= DemoUser.find(DemoUser::ACCOUNT_ID)
  end

  def workspace_settings
    @workspace_settings ||= DemoSetting.find(1)
  end

  def demo_user_count
    @demo_user_count ||= DemoUser.count
  end

  private

  def require_demo_admin
    head :forbidden unless demo_admin?
  end
end
