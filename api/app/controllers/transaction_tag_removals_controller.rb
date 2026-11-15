# Removes tags from some of the signed-in user's transactions; Undo of an addition (GLOSSARY: Bulk tagging).
class TransactionTagRemovalsController < ApplicationController
  include BulkTaggingRequest

  def create
    render_bulk_tagging bulk_tagging.remove!
  end
end
