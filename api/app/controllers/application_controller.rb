class ApplicationController < ActionController::API
  include ActionController::Cookies

  # Login CSRF guard: a cross-site HTML form can't send JSON without a CORS preflight, and we serve no CORS.
  before_action :require_json_body, if: -> { request.post? || request.put? || request.patch? }
  include Authentication
  include AttemptLimit

  rescue_from ActionDispatch::Http::Parameters::ParseError do
    render_problem :bad_request, "The request body isn’t valid JSON"
  end

  # Missing or blank (params.expect), or missing, empty or not a string (expect_string).
  rescue_from ActionController::ParameterMissing do
    render_problem :bad_request, "Send every required field"
  end

  rescue_from ActiveRecord::RecordNotFound do
    render_problem :not_found, "Not found"
  end

  rescue_from ActiveRecord::RecordInvalid do |invalid|
    render_problem :unprocessable_content, "Check the highlighted fields", errors: invalid.record.errors.to_hash
  end

  rescue_from Invite::NotPending do |not_pending|
    render_problem :unprocessable_content, not_pending.message
  end

  private
    # Not params.expect: it lets numbers through (they crash password=) and refuses all-space strings, a valid password.
    def expect_string(name)
      params[name].tap { raise ActionController::ParameterMissing, name unless it.is_a?(String) && !it.empty? }
    end

    def require_json_body
      return if request.media_type == "application/json"

      render_problem :unsupported_media_type, "Send the request body as application/json"
    end

    # RFC 9457 problem details, the one error shape (ADR 0011).
    def render_problem(status, title, errors: nil)
      problem = { type: "about:blank", title:, status: Rack::Utils.status_code(status), errors: }.compact
      render json: problem, status:, content_type: "application/problem+json"
    end
end
