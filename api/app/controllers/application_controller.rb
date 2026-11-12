class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Authentication

  rescue_from ActionController::TooManyRequests do
    render_problem :too_many_requests, "Too many attempts. Try again in a few minutes."
  end

  private
    # RFC 9457 problem details, the one error shape (ADR 0011).
    def render_problem(status, title)
      code = Rack::Utils.status_code(status)
      render json: { type: "about:blank", title:, status: code }, status:, content_type: "application/problem+json"
    end
end
