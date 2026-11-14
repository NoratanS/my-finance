class TransactionResource
  include Alba::Resource

  attributes :id, :amount, :kind, :date, :description
  many :tags, resource: TagChipResource
end
