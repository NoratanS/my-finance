-- Insights (docs/SCHEMA.md "insight"): a saved analytics question — a name plus a versioned
-- query plan the analytics service executes. The same migration provisions the read-only role
-- that service connects with (docs/SCHEMA.md "The read-only analytics role").

CREATE TABLE insight (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id BIGINT      NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL CHECK (char_length(name) <= 100),
    -- the plan is opaque to the schema: a categoryId inside it is deliberately not a foreign
    -- key, so deleting a category never has to sweep every profile's saved questions
    plan       JSONB       NOT NULL,
    viz        JSONB       NULL,
    pinned     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- one "Groceries per month" per profile; this index also serves the per-profile listing,
    -- and a profile holds dozens of insights at most, so there is no other index
    UNIQUE (profile_id, name)
);

-- The analytics service holds this credential and nothing else: read-only as a database
-- guarantee, in the same spirit as the composite FKs. Roles are cluster-global, so creation
-- has to be idempotent — a fresh database in a cluster that already has the role must migrate.
-- The password arrives as a Flyway placeholder (spring.flyway.placeholders.dbAnalyticsPassword).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfinance_ro') THEN
        CREATE ROLE myfinance_ro LOGIN PASSWORD '${dbAnalyticsPassword}';
    ELSE
        -- keep the role's password in step with the configured one rather than leaving the
        -- service unable to log in against a role someone else created
        ALTER ROLE myfinance_ro WITH LOGIN PASSWORD '${dbAnalyticsPassword}';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO myfinance_ro;
-- Also grants on flyway_schema_history: harmless, and excluding it would need a table list
-- that goes stale with the next migration.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO myfinance_ro;
-- Covers tables added by later migrations. This only applies to objects created by the role
-- running it, which is the same role every migration runs as (spring.datasource.username).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO myfinance_ro;
