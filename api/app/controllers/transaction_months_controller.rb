# The months a ledger's list can show (GLOSSARY: Transaction); apart from the list, so a failed list keeps its period select.
class TransactionMonthsController < ApplicationController
  def index
    render json: Current.user.transactions.months
  end
end
