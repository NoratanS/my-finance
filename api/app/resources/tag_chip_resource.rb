# Only what a chip draws, so a transaction list doesn't load each tag's usage.
class TagChipResource
  include Alba::Resource

  attributes :id, :name, :colour
end
