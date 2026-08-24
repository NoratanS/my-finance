-- Subscriptions (docs/SCHEMA.md "subscription"): a named recurring charge per profile.
-- The daily charge job turns due ACTIVE subscriptions into ordinary txn rows linked
-- back through txn.subscription_id.

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

-- A charge posted by the job carries the id of the subscription that produced it;
-- manual entries stay NULL. Deleting a subscription keeps its charges (SET NULL).
ALTER TABLE txn ADD COLUMN subscription_id BIGINT NULL REFERENCES subscription (id) ON DELETE SET NULL;

CREATE INDEX idx_txn_subscription_id ON txn (subscription_id);
