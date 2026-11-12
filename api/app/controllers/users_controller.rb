class UsersController < ApplicationController
  include AdminOnly

  def index
    render json: UserResource.new(User.order(:created_at)).serialize
  end
end
