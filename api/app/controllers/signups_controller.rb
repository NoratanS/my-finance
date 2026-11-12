# Signing up is accepting an invite (ADR 0012): the token in the link is the only credential.
class SignupsController < ApplicationController
  # Per process, so best effort, like sign in (ADR 0013).
  SIGNUP_ATTEMPTS = ActiveSupport::Cache::MemoryStore.new

  allow_unauthenticated_access
  rate_limit to: 10, within: 3.minutes, only: :create, store: SIGNUP_ATTEMPTS

  def show
    render json: SignupResource.new(Invite.from_token!(params[:token].to_s)).serialize
  end

  def create
    user = Invite.from_token!(params[:token].to_s).accept!(password: params[:password].to_s, currency: params[:currency].to_s)
    start_new_session_for user
    render json: SessionResource.new(user).serialize, status: :created
  end
end
