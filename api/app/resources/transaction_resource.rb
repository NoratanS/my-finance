class TransactionResource
  include Alba::Resource

  attributes :id, :amount, :kind, :date, :description
end
