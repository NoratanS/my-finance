# A user as the admin's Users list shows them.
class UserResource
  include Alba::Resource

  attributes :id, :email
  attribute(:joined_at) { |user| user.created_at.iso8601(3) }
end
