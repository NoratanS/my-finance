# Signing up is accepting an invite (ADR 0012): the token in the link is the only credential.
class SignupsController < ApplicationController
  allow_unauthenticated_access

  rescue_from Invite::NotPending do |not_pending|
    render_problem :unprocessable_content, not_pending.message
  end

  def show
    render json: SignupResource.new(Invite.from_token!(params[:token].to_s)).serialize
  end

  def create
    user = Invite.from_token!(params[:token].to_s).accept!(password: params[:password].to_s, currency: params[:currency].to_s)
    start_new_session_for user
    render json: SessionResource.new(user).serialize, status: :created
  end
end
