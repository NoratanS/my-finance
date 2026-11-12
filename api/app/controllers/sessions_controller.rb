class SessionsController < ApplicationController
  # Per process, so best effort: a cold start resets it (ADR 0013).
  SIGN_IN_ATTEMPTS = ActiveSupport::Cache::MemoryStore.new

  allow_unauthenticated_access only: :create
  rate_limit to: 10, within: 3.minutes, only: :create, store: SIGN_IN_ATTEMPTS

  def show
    render json: SessionResource.new(Current.user).serialize
  end

  def create
    if (user = User.authenticate_by(params.permit(:email, :password)))
      start_new_session_for user
      render json: SessionResource.new(user).serialize, status: :created
    else
      render_problem :unauthorized, "That email and password don’t match"
    end
  end

  def destroy
    terminate_session
    head :no_content
  end
end
