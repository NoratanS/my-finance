# The signed-in user's own tag groups (GLOSSARY: Tag group). The tags index lists them with their totals.
class TagGroupsController < ApplicationController
  def create
    group = Current.user.tag_groups.add!(name: expect_string(:name))
    render json: TagGroupResource.new(group).serialize, status: :created
  end

  def update
    group = Current.user.tag_groups.find(params.expect(:id)).rename!(expect_string(:name))
    render json: TagGroupResource.new(group).serialize
  end

  # Its tags move to no group: the foreign key nullifies them.
  def destroy
    Current.user.tag_groups.find(params.expect(:id)).destroy!
    head :no_content
  end
end
