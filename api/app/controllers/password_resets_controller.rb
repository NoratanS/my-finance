# Setting a new password from an admin's reset link (ADR 0012): the token in the link is the only credential.
class PasswordResetsController < ApplicationController
  # Per process, so best effort, like sign in (ADR 0013).
  RESET_ATTEMPTS = ActiveSupport::Cache::MemoryStore.new

  allow_unauthenticated_access
  rate_limit to: 10, within: 3.minutes, only: :update, store: RESET_ATTEMPTS

  def show
    render json: PasswordResetResource.new(User.from_reset_token!(params[:token])).serialize
  end

  def update
    user = User.reset_password!(token: params[:token], password: params[:password].to_s)
    start_new_session_for user
    render json: SessionResource.new(user).serialize
  end
end
