# Sign in, signup, password reset and password change take a credential, so each allows 10 attempts per address in WINDOW.
module AttemptLimit
  extend ActiveSupport::Concern

  # Per process, so best effort: a cold start resets it (ADR 0013). Rails keys each count by controller.
  ATTEMPTS = ActiveSupport::Cache::MemoryStore.new
  WINDOW = 3.minutes

  included do
    # Rails doesn't say how much of the window is left, so the wait is the whole window.
    rescue_from ActionController::TooManyRequests do
      response.headers["Retry-After"] = WINDOW.to_i.to_s
      render_problem :too_many_requests, "Too many attempts. Try again in a few minutes."
    end
  end

  class_methods do
    def limit_attempts(only:)
      rate_limit to: 10, within: WINDOW, only:, store: ATTEMPTS
    end
  end
end
