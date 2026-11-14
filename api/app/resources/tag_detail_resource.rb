# One tag's details panel (TagDetail), matching the TagDetail schema.
class TagDetailResource
  include Alba::Resource

  attributes :months, :transaction_count
  many :often_with do
    attributes :id, :name, :colour, :transaction_count
  end
  many :recent, resource: TransactionResource
end
