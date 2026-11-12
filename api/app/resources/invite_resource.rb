class InviteResource
  include Alba::Resource

  attributes :id, :email
  # Alba writes a Time with to_s; the contract says RFC 3339.
  attribute(:expires_at) { |invite| invite.expires_at.iso8601(3) }
end
