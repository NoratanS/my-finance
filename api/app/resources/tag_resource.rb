class TagResource
  include Alba::Resource

  attributes :id, :name, :colour
  # Only the index selects it (Tag.with_last_used_at); a tag just created has never been used.
  # Alba writes a Time with to_s; the contract says RFC 3339.
  attribute(:last_used_at) { it.read_attribute(:last_used_at)&.utc&.iso8601(3) }
end
