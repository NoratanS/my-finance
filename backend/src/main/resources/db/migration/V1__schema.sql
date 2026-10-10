-- The schema, in one migration. Design and reasoning: docs/SCHEMA.md
-- Conventions: BIGINT identity PKs, TIMESTAMPTZ audit columns, NUMERIC(19,4) money,
-- CHAR(3) ISO 4217 currency codes, TEXT + CHECK for enums, singular snake_case names.

-- "transaction" is a reserved word in Postgres, hence txn.

CREATE TABLE profile (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- unique in the instance: the profile picker never shows two entries that look alike
    name             TEXT        NOT NULL UNIQUE,
    default_currency CHAR(3)     NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id BIGINT      NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    parent_id  BIGINT      NULL,
    name       TEXT        NOT NULL,
    -- NULL means "inherit from the nearest ancestor with one", resolved client-side; the
    -- server only stores and validates the raw lowercase #rrggbb value
    color      TEXT        NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- composite-FK target: lets child tables assert "same profile as the category"
    UNIQUE (id, profile_id),
    CHECK (parent_id <> id),
    -- a child must live in the same profile as its parent: makes profile-scoping a DB invariant
    FOREIGN KEY (parent_id, profile_id) REFERENCES category (id, profile_id) ON DELETE RESTRICT
);

-- Sibling name uniqueness needs two partial indexes because NULL <> NULL in SQL:
-- a single UNIQUE (profile_id, parent_id, name) would let two roots share a name.
CREATE UNIQUE INDEX uq_category_sibling_name ON category (profile_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX uq_category_root_name    ON category (profile_id, name)            WHERE parent_id IS NULL;

CREATE INDEX idx_category_profile_id ON category (profile_id);
CREATE INDEX idx_category_parent_id  ON category (parent_id);

-- A named recurring charge per profile. The daily charge job turns due ACTIVE subscriptions
-- into ordinary txn rows linked back through txn.subscription_id.
CREATE TABLE subscription (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id      BIGINT        NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    category_id     BIGINT        NOT NULL,
    name            TEXT          NOT NULL,
    amount          NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    billing_period  TEXT          NOT NULL CHECK (billing_period IN ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
    next_billing_on DATE          NOT NULL,
    status          TEXT          NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
    notes           TEXT          NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- "Netflix" once per profile; rename to distinguish plans
    UNIQUE (profile_id, name),
    -- a subscription cannot be filed under another profile's category
    FOREIGN KEY (category_id, profile_id) REFERENCES category (id, profile_id) ON DELETE RESTRICT
);

-- Serves both the dashboard ("active, due in the next 30 days") and the charge job.
CREATE INDEX idx_subscription_profile_status_next ON subscription (profile_id, status, next_billing_on);

CREATE TABLE txn (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id      BIGINT        NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    category_id     BIGINT        NOT NULL,
    amount          NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    txn_type        TEXT          NOT NULL CHECK (txn_type IN ('EXPENSE', 'INCOME')),
    occurred_on     DATE          NOT NULL,
    description     TEXT          NULL,
    -- free text, typed in the transaction form or backfilled from repeating descriptions; the
    -- categorical axis of the Insights merchant dimension, where NULL renders as "Unspecified"
    merchant        TEXT          NULL CHECK (char_length(merchant) <= 100),
    -- a charge posted by the job carries the id of the subscription that produced it; manual
    -- entries stay NULL. Deleting a subscription keeps its charges (SET NULL).
    subscription_id BIGINT        NULL REFERENCES subscription (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- a transaction cannot be filed under another profile's category
    FOREIGN KEY (category_id, profile_id) REFERENCES category (id, profile_id) ON DELETE RESTRICT
);

CREATE INDEX idx_txn_profile_date          ON txn (profile_id, occurred_on DESC);
CREATE INDEX idx_txn_profile_category_date ON txn (profile_id, category_id, occurred_on);
CREATE INDEX idx_txn_subscription_id       ON txn (subscription_id);

CREATE TABLE budget (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id   BIGINT        NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    category_id  BIGINT        NOT NULL,
    amount_limit NUMERIC(19,4) NOT NULL CHECK (amount_limit > 0),
    currency     CHAR(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    period_start DATE          NOT NULL,
    period_end   DATE          NOT NULL,   -- inclusive
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CHECK (period_end >= period_start),
    UNIQUE (profile_id, category_id, period_start, period_end),
    FOREIGN KEY (category_id, profile_id) REFERENCES category (id, profile_id) ON DELETE RESTRICT
);

CREATE INDEX idx_budget_profile_period ON budget (profile_id, period_start, period_end);

-- A saved question about a profile's transactions: a name plus a versioned plan the plan executor runs.
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

-- The read-only role the plan executor connects with (docs/SCHEMA.md "The read-only
-- analytics role"). It holds this credential and nothing else: read-only as a database
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
