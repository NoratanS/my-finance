-- The passwordless single-user mode (MYFINANCE_AUTH_MODE=none, ARCHITECTURE.md "Profiles and
-- authentication") stores a local account with no password at all. Every account created through
-- POST /api/auth/register still gets a hash; the column is simply no longer mandatory.
ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;
