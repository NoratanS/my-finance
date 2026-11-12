# A password reset link (ADR 0012): Rails' signed reset token, stored nowhere, so it dies when the password changes.
ResetLink = Data.define(:email, :token, :expires_at)
