FactoryBot.define do
  factory :transaction do
    user
    amount { 1_000 }
    kind { "expense" }
    date { Date.current }
  end
end
