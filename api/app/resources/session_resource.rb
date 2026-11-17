class SessionResource
  include Alba::Resource

  attributes :email, :admin, :currency, :time_zone
  attribute(:currency_locked, &:currency_locked?)
end
