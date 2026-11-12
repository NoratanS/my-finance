FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "correct horse battery" }

    trait :admin do
      admin { true }
    end
  end
end
