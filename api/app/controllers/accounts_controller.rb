# The signed-in user's own settings (GLOSSARY: Account).
class AccountsController < ApplicationController
  def update
    Current.user.update!(currency: params.expect(:currency))
    render json: SessionResource.new(Current.user).serialize
  end
end
