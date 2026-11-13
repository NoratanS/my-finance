# The signed-in user's own ledger (GLOSSARY: Transaction).
class TransactionsController < ApplicationController
  def index
    page = TransactionPage.new(Current.user.transactions, page: params[:page])
    render json: TransactionResource.new(page.transactions).serialize(root_key: :data, meta: page.meta)
  end

  def create
    transaction = Current.user.transactions.create!(
      amount: expect_integer(:amount), kind: params.expect(:kind), date: params.expect(:date), description: params[:description].to_s
    )
    render json: TransactionResource.new(transaction).serialize, status: :created
  end
end
