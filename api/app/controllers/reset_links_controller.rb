class ResetLinksController < ApplicationController
  include AdminOnly

  def create
    link = User.find(params.expect(:user_id)).reset_link
    render json: ResetLinkResource.new(link).serialize, status: :created
  end
end
