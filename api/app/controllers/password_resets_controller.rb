# Setting a new password from an admin's reset link (ADR 0012): the token in the link is the only credential.
class PasswordResetsController < ApplicationController
  allow_unauthenticated_access
  limit_attempts only: :update

  def show
    render json: PasswordResetResource.new(User.from_reset_token!(params[:token])).serialize
  end

  def update
    user = User.reset_password!(token: params[:token], password: params.expect(:password))
    start_new_session_for user
    render json: SessionResource.new(user).serialize
  end
end
