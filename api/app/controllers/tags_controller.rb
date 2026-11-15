# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def index
    totals = TagTotals.new(Current.user, period: params[:period])
    # By hand, not Alba's root_key: the groups sit beside the tags, and Alba offers only data and meta.
    render json: { data: TagResource.new(totals.tags).to_h, groups: TagGroupSummaryResource.new(totals.groups).to_h, meta: totals.meta }
  end

  # Another user's tag is a 404; the period only steers Often with.
  def show
    detail = TagDetail.new(Current.user.tags.find(params.expect(:id)), period: params[:period])
    render json: TagDetailResource.new(detail).serialize
  end

  def create
    tag = Current.user.tags.add!(name: expect_string(:name), colour:, tag_group: optional_group)
    render json: TagResource.new(tag).serialize, status: :created
  end

  # The answer carries this month's totals, as the index would.
  def update
    tag = Current.user.tags.find(params.expect(:id)).edit!(**changes)
    render json: TagResource.new(tag).serialize
  end

  # Its transactions stay: the foreign key drops only their links to it.
  def destroy
    Current.user.tags.find(params.expect(:id)).destroy!
    head :no_content
  end

  private
    # Optional, so absent or null is no colour, but a hash, array or number is a 400, not a 422.
    def colour
      params[:colour].tap { raise ActionController::ParameterMissing, :colour unless it.nil? || it.is_a?(String) }
    end

    # Absent or null is no group; another user's group is a 404, and anything but an integer a 400.
    def optional_group
      params[:group_id].then do |id|
        raise ActionController::ParameterMissing, :group_id unless id.nil? || id.is_a?(Integer)

        id && Current.user.tag_groups.find(id)
      end
    end

    # Only the fields sent, so a sent null colour or group_id clears it.
    def changes
      edits = {}
      edits[:name] = expect_string(:name) if params.key?(:name)
      edits[:colour] = colour if params.key?(:colour)
      edits[:tag_group] = optional_group if params.key?(:group_id)
      edits.presence || raise(ActionController::ParameterMissing, :tag)
    end
end
