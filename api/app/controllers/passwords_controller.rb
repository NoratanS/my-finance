# Changing your own password: the current one is the credential (ADR 0012).
class PasswordsController < ApplicationController
  limit_attempts only: :update

  def update
    current_password, password = expect_string(:current_password), expect_string(:password)
    Current.user.change_password!(password, challenge: current_password, keeping: Current.session)
    render json: SessionResource.new(Current.user).serialize
  end
end
