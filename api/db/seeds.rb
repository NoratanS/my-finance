# Sign-in users for the verify skill. Development only; idempotent, so `db:seed` can run any time.
return unless Rails.env.development?

PASSWORD = "verify password 42".freeze

User.find_or_create_by!(email: "verify-admin@example.com") do |user|
  user.password = PASSWORD
  # Only one admin may exist; an existing dev admin keeps the role.
  user.admin = !User.exists?(admin: true)
end
User.find_or_create_by!(email: "verify-member@example.com") { it.password = PASSWORD }

admin = User.find_by(admin: true)
warn "Seeds: #{admin.email} is the admin, not verify-admin@example.com." unless admin.email == "verify-admin@example.com"
