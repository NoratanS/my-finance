class ApplicationController < ActionController::API
  include ActionController::Cookies

  # Login CSRF guard: a cross-site HTML form can't send JSON without a CORS preflight, and we serve no CORS.
  before_action :require_json_body, if: -> { request.post? || request.put? || request.patch? }
  include Authentication

  rescue_from ActionController::TooManyRequests do
    render_problem :too_many_requests, "Too many attempts. Try again in a few minutes."
  end

  private
    def require_json_body
      return if request.media_type == "application/json"

      render_problem :unsupported_media_type, "Send the request body as application/json"
    end

    # RFC 9457 problem details, the one error shape (ADR 0011).
    def render_problem(status, title)
      code = Rack::Utils.status_code(status)
      render json: { type: "about:blank", title:, status: code }, status:, content_type: "application/problem+json"
    end
end
