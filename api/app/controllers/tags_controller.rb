# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def index
    render json: TagResource.new(Current.user.tags.a_to_z).serialize(root_key: :data)
  end

  def create
    tag = Current.user.tags.add!(name: expect_string(:name), colour: params[:colour])
    render json: TagResource.new(tag).serialize, status: :created
  end
end
