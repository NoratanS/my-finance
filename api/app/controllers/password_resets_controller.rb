# Setting a new password from an admin's reset link (ADR 0012): the token in the link is the only credential.
class PasswordResetsController < ApplicationController
  allow_unauthenticated_access

  def show
    render json: PasswordResetResource.new(User.from_reset_token!(params[:token])).serialize
  end
end
