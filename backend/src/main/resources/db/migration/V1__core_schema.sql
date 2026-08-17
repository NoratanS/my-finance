-- Core domain schema. Design and reasoning: docs/SCHEMA.md
-- Conventions: BIGINT identity PKs, TIMESTAMPTZ audit columns, NUMERIC(19,4) money,
-- CHAR(3) ISO 4217 currency codes, TEXT + CHECK for enums, singular snake_case names.

-- "user" and "transaction" are reserved words in Postgres, hence app_user / txn.

CREATE TABLE app_user (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    display_name  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profile (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    default_currency CHAR(3)     NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, name),
    -- composite-FK target: lets child tables assert "same user as the profile"
    UNIQUE (id, user_id)
);

CREATE INDEX idx_profile_user_id ON profile (user_id);

CREATE TABLE category (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id BIGINT      NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    parent_id  BIGINT      NULL,
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- composite-FK target (same trick as profile)
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

CREATE TABLE txn (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id  BIGINT        NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    category_id BIGINT        NOT NULL,
    amount      NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    currency    CHAR(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    txn_type    TEXT          NOT NULL CHECK (txn_type IN ('EXPENSE', 'INCOME')),
    occurred_on DATE          NOT NULL,
    description TEXT          NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- a transaction cannot be filed under another profile's category
    FOREIGN KEY (category_id, profile_id) REFERENCES category (id, profile_id) ON DELETE RESTRICT
);

CREATE INDEX idx_txn_profile_date          ON txn (profile_id, occurred_on DESC);
CREATE INDEX idx_txn_profile_category_date ON txn (profile_id, category_id, occurred_on);

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
