# The signed-in user's own ledger (GLOSSARY: Transaction).
class TransactionsController < ApplicationController
  def index
    filter = TransactionFilter.new(Current.user.transactions, **filter_params)
    page = TransactionPage.new(filter.transactions, page: params[:page])
    render json: TransactionResource.new(page.transactions).serialize(root_key: :data, meta: page.meta.merge(filter.meta))
  end

  def create
    transaction = Current.user.transactions.new.save_with_tags!(transaction_params, tag_ids:)
    render json: TransactionResource.new(transaction).serialize, status: :created
  end

  def update
    transaction = find_transaction.save_with_tags!(transaction_params, tag_ids:)
    render json: TransactionResource.new(transaction).serialize
  end

  def destroy
    find_transaction.destroy!
    head :no_content
  end

  private
    # Only the filters sent; TransactionFilter refuses a value it doesn't offer.
    def filter_params
      %i[ period kind q ].filter_map { [ it, params[it] ] if params.key?(it) }.to_h
    end

    # Another user's transaction is a 404, before the body is even read.
    def find_transaction
      Current.user.transactions.find(params.expect(:id))
    end

    # Create and update take the same full body, so they share every 400 and 422.
    def transaction_params
      { amount: expect_integer(:amount), kind: params.expect(:kind), date: expect_date(:date), description: }
    end

    # Optional, so absent or null is "", but a hash, array or number is a 400, not stored as text.
    def description
      params[:description].tap { raise ActionController::ParameterMissing, :description unless it.nil? || it.is_a?(String) }.to_s
    end

    # Absent or null is no tags; anything but an array of whole numbers is a 400.
    def tag_ids
      sent_tag_ids.tap { raise ActionController::ParameterMissing, :tag_ids unless it.nil? || (it.is_a?(Array) && it.all?(Integer)) }.to_a
    end

    # Read from the body as sent: Rails' deep munge drops nils from param arrays, which would make [nil] no tags.
    def sent_tag_ids
      body = request.raw_post.presence && ActiveSupport::JSON.decode(request.raw_post)
      body["tag_ids"] if body.is_a?(Hash)
    end
end
