# A group with its totals over the asked tag period (TagGroupTotals), as the tags index lists it.
class TagGroupSummaryResource
  include Alba::Resource

  attributes :id, :name, :expense, :income, :transaction_count
end
