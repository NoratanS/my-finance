# Admin endpoints answer 404 to everyone else, so they don't reveal they exist (ADR 0012).
module AdminOnly
  extend ActiveSupport::Concern

  included do
    before_action :require_admin
  end

  private
    def require_admin
      render_problem :not_found, "Not found" unless Current.user.admin?
    end
end
