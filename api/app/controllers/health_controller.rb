class HealthController < ApplicationController
  def show
    render json: HealthResource.new(Health.check).serialize
  end
end
