class ApplicationController < ActionController::API
  include ActionController::Cookies

  # Login CSRF guard: a cross-site HTML form can't send JSON without a CORS preflight, and we serve no CORS.
  before_action :require_json_body, if: -> { request.post? || request.put? || request.patch? }
  include Authentication
  include AttemptLimit

  rescue_from ActionDispatch::Http::Parameters::ParseError do
    render_problem :bad_request, "The request body isn’t valid JSON"
  end

  # Missing or blank (params.expect), missing, empty or not a string (expect_string), not an integer (expect_integer), or not a YYYY-MM-DD date (expect_date).
  rescue_from ActionController::ParameterMissing do
    render_problem :bad_request, "Send every required field"
  end

  rescue_from TransactionFilter::Unknown, TagTotals::Unknown do |unknown|
    render_problem :bad_request, "Pick a filter the list offers", errors: { unknown.message => [ "isn’t one the list offers" ] }
  end

  rescue_from ActiveRecord::RecordNotFound do
    render_problem :not_found, "Not found"
  end

  # Its own type, so the form can tell a deleted tag from the transaction it was saving.
  rescue_from Transaction::TagNotFound do
    render_problem :not_found, "A tag was deleted elsewhere", type: "tag-not-found"
  end

  rescue_from ActiveRecord::RecordInvalid do |invalid|
    render_problem :unprocessable_content, "Check the highlighted fields", errors: invalid.record.errors.to_hash
  end

  # tag-name-taken or tag-group-name-taken, carrying the record that has the name so the client can offer it.
  rescue_from TagName::Taken do |taken|
    model = taken.existing.model_name
    render_problem :unprocessable_content, "You already have a #{model.human.downcase} with this name",
                   type: "#{model.element.dasherize}-name-taken", errors: { name: [ taken.message ] }, existing_id: taken.existing.id
  end

  rescue_from Invite::NotPending do |not_pending|
    render_problem :unprocessable_content, not_pending.message
  end

  private
    # Not params.expect: it lets numbers through (they crash password=) and refuses all-space strings, a valid password.
    def expect_string(name)
      params[name].tap { raise ActionController::ParameterMissing, name unless it.is_a?(String) && !it.empty? }
    end

    # Not params.expect: it would cast 12.5 or "12" where only a whole number of minor units is meant.
    def expect_integer(name)
      params[name].tap { raise ActionController::ParameterMissing, name unless it.is_a?(Integer) }
    end

    # A calendar date as YYYY-MM-DD only; Rails would otherwise read 10/10/2026 or crash on a number.
    def expect_date(name)
      params[name].tap { raise ActionController::ParameterMissing, name unless it.is_a?(String) && it.match?(/\A\d{4}-\d{2}-\d{2}\z/) }
    end

    def require_json_body
      return if request.media_type == "application/json"

      render_problem :unsupported_media_type, "Send the request body as application/json"
    end

    # RFC 9457 problem details, the one error shape (ADR 0011). Members: errors, and a named type's extensions.
    def render_problem(status, title, type: "about:blank", **members)
      problem = { type:, title:, status: Rack::Utils.status_code(status), **members }.compact
      render json: problem, status:, content_type: "application/problem+json"
    end
end
