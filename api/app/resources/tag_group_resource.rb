# A group as created or renamed, without totals: only the tags index sums them.
class TagGroupResource
  include Alba::Resource

  attributes :id, :name
end
