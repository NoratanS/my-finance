# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def index
    totals = TagTotals.new(Current.user, period: params[:period])
    render json: TagResource.new(totals.tags).serialize(root_key: :data, meta: totals.meta)
  end

  def create
    tag = Current.user.tags.add!(name: expect_string(:name), colour:, tag_group: group)
    render json: TagResource.new(tag).serialize, status: :created
  end

  # Only the group for now (GLOSSARY: Tag group); the answer carries this month's totals, as the index would.
  def update
    tag = Current.user.tags.find(params.expect(:id)).tap { it.update!(tag_group: required_group) }
    render json: TagResource.new(TagTotals.new(Current.user, period: nil).tags.find(tag.id)).serialize
  end

  private
    # Optional, so absent or null is no colour, but a hash, array or number is a 400, not a 422.
    def colour
      params[:colour].tap { raise ActionController::ParameterMissing, :colour unless it.nil? || it.is_a?(String) }
    end

    # Absent or null is no group; another user's group is a 404, and anything but an integer a 400.
    def group
      params[:group_id].then do |id|
        raise ActionController::ParameterMissing, :group_id unless id.nil? || id.is_a?(Integer)

        id && Current.user.tag_groups.find(id)
      end
    end

    # Null is allowed, but the field must be sent: it is all an update takes.
    def required_group
      raise ActionController::ParameterMissing, :group_id unless params.key?(:group_id)

      group
    end
end
