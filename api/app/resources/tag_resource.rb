class TagResource
  include Alba::Resource

  attributes :id, :name, :colour
  attribute(:group_id, &:tag_group_id)
  # read_attribute: only the index selects it, and a tag just created has never been used. iso8601: Alba writes to_s.
  attribute(:last_used_at) { it.read_attribute(:last_used_at)&.utc&.iso8601(3) }
  # Minor units over the asked tag period (TagTotals); a tag just created has none yet.
  attribute(:expense) { it.read_attribute(:expense) || 0 }
  attribute(:income) { it.read_attribute(:income) || 0 }
  attribute(:transaction_count) { it.read_attribute(:transaction_count) || 0 }
end
