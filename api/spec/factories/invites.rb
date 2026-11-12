FactoryBot.define do
  factory :invite do
    sequence(:email) { |n| "friend#{n}@example.com" }
    transient do
      token { SecureRandom.urlsafe_base64(32) }
    end
    token_digest { Invite.digest(token) }
    expires_at { 7.days.from_now }
    created_by factory: :user

    trait :expired do
      expires_at { 1.minute.ago }
    end

    trait :accepted do
      accepted_at { 1.minute.ago }
    end
  end
end
