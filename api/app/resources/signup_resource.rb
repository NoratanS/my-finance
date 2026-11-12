# The invite as its signup page sees it.
class SignupResource
  include Alba::Resource

  attributes :email, :status
  attribute(:expires_at) { |invite| invite.expires_at.iso8601(3) }
end
