-- Phase 4b merchant fixtures for tests/test_executor_merchant.py.
-- Fixed ids (9000+) because the plan fixtures carry a literal categoryId, and OVERRIDING SYSTEM
-- VALUE because the id columns are GENERATED ALWAYS. Its own profile, so the Phase 4 goldens keep
-- their own numbers.

INSERT INTO app_user (id, email, password_hash, display_name)
OVERRIDING SYSTEM VALUE
VALUES (9000, 'merchants@example.com', 'not-a-real-hash', 'Merchant Fixtures');

INSERT INTO profile (id, user_id, name, default_currency)
OVERRIDING SYSTEM VALUE
VALUES (9000, 9000, 'Merchants', 'PLN');

INSERT INTO category (id, profile_id, parent_id, name)
OVERRIDING SYSTEM VALUE
VALUES (9000, 9000, NULL, 'Groceries');

-- Three months of two merchants, well inside the last-12-months window of a 2026-09-04 clock.
INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, description, merchant) VALUES
    (9000, 9000, 243.5000, 'PLN', 'EXPENSE', DATE '2026-07-04', 'weekly shop', 'Lidl'),
    (9000, 9000, 310.0000, 'PLN', 'EXPENSE', DATE '2026-08-11', 'weekly shop', 'Lidl'),
    (9000, 9000, 120.0000, 'PLN', 'EXPENSE', DATE '2026-09-02', 'weekly shop', 'Lidl'),
    (9000, 9000, 180.0000, 'PLN', 'EXPENSE', DATE '2026-07-19', 'weekly shop', 'Biedronka'),
    (9000, 9000, 212.0000, 'PLN', 'EXPENSE', DATE '2026-08-23', 'weekly shop', 'Biedronka'),
    (9000, 9000,  95.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', 'weekly shop', 'Biedronka'),
    -- No merchant at all: this row is the "Unspecified" group, not a missing row.
    (9000, 9000,  50.0000, 'PLN', 'EXPENSE', DATE '2026-08-05', 'cash', NULL);

-- A long tail of 26 merchants worth 1.00 … 26.00, so a merchant breakdown crosses the 25-group cap.
INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, merchant)
SELECT 9000, 9000, n, 'PLN', 'EXPENSE', DATE '2026-08-15', 'M' || to_char(n, 'FM00')
  FROM generate_series(1, 26) AS n;
