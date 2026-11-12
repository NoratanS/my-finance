# Sign in, signup and password reset take a credential, so each allows 10 attempts per address in 3 minutes.
module AttemptLimit
  extend ActiveSupport::Concern

  # Per process, so best effort: a cold start resets it (ADR 0013). Rails keys each count by controller.
  ATTEMPTS = ActiveSupport::Cache::MemoryStore.new

  class_methods do
    def limit_attempts(only:)
      rate_limit to: 10, within: 3.minutes, only:, store: ATTEMPTS
    end
  end
end
