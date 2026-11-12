class HealthController < ApplicationController
  allow_unauthenticated_access
  def show
    render json: HealthResource.new(Health.check).serialize
  end
end
