class SessionsController < ApplicationController
  # Per process, so best effort: a cold start resets it (ADR 0013).
  SIGN_IN_ATTEMPTS = ActiveSupport::Cache::MemoryStore.new

  allow_unauthenticated_access only: :create
  rate_limit to: 10, within: 3.minutes, only: :create, store: SIGN_IN_ATTEMPTS

  def show
    render json: SessionResource.new(Current.user).serialize
  end

  def create
    if (user = authenticate)
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

  private
    # Both keys, always strings: authenticate_by raises on a missing one.
    def authenticate
      email, password = params[:email].to_s, params[:password].to_s
      # Postgres strings can't hold NUL, so no stored email has one (and the query would raise).
      return if [ email, password ].any? { it.include?("\u0000") }

      User.authenticate_by(email:, password:)
    end
end
