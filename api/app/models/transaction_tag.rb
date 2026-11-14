# One tag on one transaction. created_at is when it was put on, so an edit keeps it.
class TransactionTag < ApplicationRecord
  belongs_to :ledger_transaction, class_name: "Transaction", foreign_key: :transaction_id, inverse_of: :transaction_tags
  belongs_to :tag
end
