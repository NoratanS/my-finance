# The body both bulk tagging endpoints take: rows from one page, tags for one transaction (GLOSSARY: Bulk tagging).
module BulkTaggingRequest
  extend ActiveSupport::Concern

  private
    def bulk_tagging
      BulkTagging.new(Current.user, transaction_ids: id_list(:transaction_ids, TransactionPage::PER_PAGE), tag_ids: id_list(:tag_ids, Transaction::MAX_TAGS))
    end

    def render_bulk_tagging(result)
      render json: BulkTaggingResource.new(result).serialize, status: :created
    end

    # Bounded as sent, before duplicates drop, so the limit is what the client can rely on.
    def id_list(name, max)
      expect_ids(name).tap { raise ActionController::ParameterMissing, name unless it.size.between?(1, max) }
    end
end
