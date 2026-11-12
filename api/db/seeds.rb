# Sign-in users for the verify skill. Development only; idempotent, so `db:seed` can run any time.
return unless Rails.env.development?

PASSWORD = "verify password 42".freeze

verify_admin = User.find_or_create_by!(email: "verify-admin@example.com") { it.password = PASSWORD }
User.find_or_create_by!(email: "verify-member@example.com") { it.password = PASSWORD }

# Only one admin may exist; an existing dev admin keeps the role.
admin = User.find_by(admin: true) || verify_admin.tap { it.update!(admin: true) }
warn "Seeds: #{admin.email} is the admin, not #{verify_admin.email}." unless admin == verify_admin
