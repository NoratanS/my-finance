# Signing up is accepting an invite (ADR 0012): the token in the link is the only credential.
class SignupsController < ApplicationController
  allow_unauthenticated_access
  limit_attempts only: :create

  def show
    render json: SignupResource.new(Invite.from_token!(params[:token])).serialize
  end

  def create
    password = expect_string(:password)
    user = Invite.from_token!(params[:token]).accept!(password:, currency: params[:currency].to_s)
    start_new_session_for user
    render json: SessionResource.new(user).serialize, status: :created
  end
end
