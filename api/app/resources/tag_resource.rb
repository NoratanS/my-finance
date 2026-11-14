class TagResource
  include Alba::Resource

  attributes :id, :name, :colour
  # read_attribute: only the index selects it, and a tag just created has never been used. iso8601: Alba writes to_s.
  attribute(:last_used_at) { it.read_attribute(:last_used_at)&.utc&.iso8601(3) }
end
