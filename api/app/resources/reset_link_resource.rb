# A just-created reset link: the only response that carries the token.
class ResetLinkResource
  include Alba::Resource

  attributes :email, :token
  attribute(:expires_at) { |link| link.expires_at.utc.iso8601(3) }
end
