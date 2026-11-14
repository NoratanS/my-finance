# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def index
    render json: TagResource.new(TagTotals.new(Current.user.tags).tags).serialize(root_key: :data)
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
