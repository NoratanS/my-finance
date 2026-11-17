# The signed-in user's own settings (GLOSSARY: Account).
class AccountsController < ApplicationController
  SETTINGS = %i[ currency time_zone ].freeze

  def update
    Current.user.update!(settings)
    render json: SessionResource.new(Current.user).serialize
  end

  private
    # Either setting or both; each one sent must be a non-empty string, and sending neither is missing.
    def settings
      sent = SETTINGS.select { params.key?(it) }
      raise ActionController::ParameterMissing, SETTINGS.join(" or ") if sent.empty?

      sent.index_with { expect_string(it) }
    end
end
