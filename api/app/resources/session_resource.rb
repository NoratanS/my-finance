class SessionResource
  include Alba::Resource

  attributes :email, :admin, :currency
  attribute(:currency_locked, &:currency_locked?)
end
