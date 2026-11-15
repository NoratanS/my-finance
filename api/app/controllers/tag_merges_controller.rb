# Folds one of the signed-in user's tags into another (GLOSSARY: Merge). Either tag being another user's is a 404.
class TagMergesController < ApplicationController
  def create
    source = Current.user.tags.find(params.expect(:tag_id))
    target = source.merge_into!(Current.user.tags.find(expect_integer(:target_id)))
    render json: TagResource.new(target).serialize, status: :created
  end
end
