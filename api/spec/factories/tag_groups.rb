FactoryBot.define do
  factory :tag_group do
    user
    sequence(:name) { |n| "Group #{n}" }
  end
end
