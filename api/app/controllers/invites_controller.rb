class InvitesController < ApplicationController
  include AdminOnly

  def index
    render json: InviteResource.new(Current.user.invites.pending.order(:expires_at)).serialize
  end

  def create
    invite = Invite.issue!(email: params[:email].to_s, by: Current.user)
    render json: InviteResource.new(invite).serialize, status: :created
  end

  def destroy
    Current.user.invites.unaccepted.find(params.expect(:id)).destroy!
    head :no_content
  end
end
