class UsersController < ApplicationController
  before_action :require_demo_admin
  before_action -> { @page = "users" }
  before_action :set_user, only: [:show, :edit, :update, :destroy]

  def index
    @last_page = [(demo_user_count / 20.0).ceil, 1].max
    @page_number = params[:number].to_i.clamp(1, @last_page)
    @users = DemoUser.order(:id).limit(20).offset((@page_number - 1) * 20)
    render "demo/show"
  end

  def show
  end

  def new
    @user = DemoUser.new
  end

  def edit
  end

  def create
    @user = DemoUser.new(user_params)
    if @user.save
      redirect_to user_path(@user), notice: "User created.", status: :see_other
    else
      render :new, status: :unprocessable_content
    end
  end

  def update
    if @user.update(user_params)
      redirect_to user_path(@user), notice: "User saved.", status: :see_other
    else
      render :edit, status: :unprocessable_content
    end
  end

  def destroy
    if @user.id == DemoUser::ACCOUNT_ID
      redirect_to user_path(@user), alert: "The demo administrator cannot be deleted.", status: :see_other
    else
      @user.destroy!
      redirect_to users_path, notice: "User deleted.", status: :see_other
    end
  end

  private

  def set_user
    @user = DemoUser.find(params[:id])
  end

  def user_params
    params.require(:user).permit(:name, :email, :plan, :token_balance, :status)
  end
end
