# The signed-in user's own tag groups (GLOSSARY: Tag group). The tags index lists them with their totals.
class TagGroupsController < ApplicationController
  def create
    group = Current.user.tag_groups.add!(name: expect_string(:name))
    render json: TagGroupResource.new(group).serialize, status: :created
  end
end
