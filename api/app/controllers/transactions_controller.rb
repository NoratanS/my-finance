# The signed-in user's own ledger (GLOSSARY: Transaction).
class TransactionsController < ApplicationController
  def index
    page = TransactionPage.new(Current.user.transactions, page: params[:page])
    render json: TransactionResource.new(page.transactions).serialize(root_key: :data, meta: page.meta)
  end

  def create
    transaction = Current.user.transactions.create!(
      amount: expect_integer(:amount), kind: params.expect(:kind), date: expect_date(:date), description:
    )
    render json: TransactionResource.new(transaction).serialize, status: :created
  end

  private
    # Optional, so absent or null is "", but a hash, array or number is a 400, not stored as text.
    def description
      params[:description].tap { raise ActionController::ParameterMissing, :description unless it.nil? || it.is_a?(String) }.to_s
    end
end
