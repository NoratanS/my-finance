# Adds tags to some of the signed-in user's transactions (GLOSSARY: Bulk tagging).
class TransactionTagAdditionsController < ApplicationController
  include BulkTaggingRequest

  def create
    render_bulk_tagging bulk_tagging.add!
  end
end
