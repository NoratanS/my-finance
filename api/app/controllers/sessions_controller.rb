class SessionsController < ApplicationController
  allow_unauthenticated_access only: :create
  limit_attempts only: :create

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
    # A missing or malformed email reads as "" and fails as a wrong one (401); authenticate_by raises on nil.
    def authenticate
      email, password = params[:email].to_s, expect_string(:password)
      # Postgres strings can't hold NUL, so no stored email has one (and the query would raise).
      return if [ email, password ].any? { it.include?("\u0000") }

      User.authenticate_by(email:, password:)
    end
end
