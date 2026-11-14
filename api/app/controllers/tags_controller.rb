# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def index
    totals = TagTotals.new(Current.user, period: params[:period])
    render json: TagResource.new(totals.tags).serialize(root_key: :data, meta: totals.meta)
  end

  def create
    tag = Current.user.tags.add!(name: expect_string(:name), colour:)
    render json: TagResource.new(tag).serialize, status: :created
  end

  private
    # Optional, so absent or null is no colour, but a hash, array or number is a 400, not a 422.
    def colour
      params[:colour].tap { raise ActionController::ParameterMissing, :colour unless it.nil? || it.is_a?(String) }
    end
end
