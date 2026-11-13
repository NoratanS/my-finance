# The signed-in user's own ledger (GLOSSARY: Transaction).
class TransactionsController < ApplicationController
  def create
    transaction = Current.user.transactions.create!(
      amount: expect_integer(:amount), kind: params.expect(:kind), date: params.expect(:date), description: params[:description].to_s
    )
    render json: TransactionResource.new(transaction).serialize, status: :created
  end
end
