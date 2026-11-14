# The signed-in user's own tags (GLOSSARY: Tag).
class TagsController < ApplicationController
  def create
    tag = Current.user.tags.create!(name: expect_string(:name), colour: params[:colour])
    render json: TagResource.new(tag).serialize, status: :created
  end
end
