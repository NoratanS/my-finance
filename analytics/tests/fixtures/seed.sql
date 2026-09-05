-- Golden-test fixture data for the analytics executor (docs/INSIGHTS.md "Testing strategy").
-- Ids are explicit (OVERRIDING SYSTEM VALUE) so golden envelopes can assert exact group keys.
-- Nothing in the suite inserts without an id, so the untouched identity sequences never collide.
-- Every relative range in the fixtures is written against a frozen today of 2026-09-15.

INSERT INTO app_user (id, email, password_hash, display_name) OVERRIDING SYSTEM VALUE
VALUES (1, 'golden@example.test', 'not-a-real-hash', 'Golden');

-- Profile 1 executes every fixture plan; profile 2 exists only to prove nothing leaks across profiles.
INSERT INTO profile (id, user_id, name, default_currency) OVERRIDING SYSTEM VALUE
VALUES (1, 1, 'Main', 'PLN'),
       (2, 1, 'Control', 'PLN');

INSERT INTO category (id, profile_id, parent_id, name) OVERRIDING SYSTEM VALUE VALUES
    (10, 1, NULL, 'Groceries'),
    (11, 1, 10,   'Lidl'),
    (12, 1, 10,   'Biedronka'),
    (20, 1, NULL, 'Transport'),
    (21, 1, 20,   'Fuel'),
    (30, 1, NULL, 'Salary'),
    (40, 1, NULL, 'Many'),
    (90, 2, NULL, 'Groceries');

-- 30 children under 'Many': the group-cap fixture (docs/INSIGHTS.md "Bounded output").
INSERT INTO category (id, profile_id, parent_id, name) OVERRIDING SYSTEM VALUE
SELECT 400 + g, 1, 40, 'Many ' || to_char(g, 'FM00') FROM generate_series(1, 30) AS g;

INSERT INTO txn (id, profile_id, category_id, amount, currency, txn_type, occurred_on, description)
OVERRIDING SYSTEM VALUE VALUES
    (101, 1, 11,   70.0000, 'PLN', 'EXPENSE', DATE '2025-10-10', 'previous calendar year'),
    (102, 1, 12,  130.0000, 'PLN', 'EXPENSE', DATE '2025-12-24', 'previous calendar year'),
    (103, 1, 11,  100.0000, 'PLN', 'EXPENSE', DATE '2026-07-05', NULL),
    (104, 1, 12,   50.0000, 'PLN', 'EXPENSE', DATE '2026-07-20', NULL),
    (105, 1, 11,  200.0000, 'PLN', 'EXPENSE', DATE '2026-08-03', NULL),
    (106, 1, 12,  300.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', NULL),
    (107, 1, 10,   25.0000, 'PLN', 'EXPENSE', DATE '2026-09-10', 'filed on the parent itself'),
    (108, 1, 21,  400.0000, 'PLN', 'EXPENSE', DATE '2026-09-02', NULL),
    (109, 1, 11,   10.0000, 'EUR', 'EXPENSE', DATE '2026-08-15', 'the multi-currency row'),
    (110, 1, 30, 4000.0000, 'PLN', 'INCOME',  DATE '2026-08-05', NULL),
    (111, 1, 30, 5000.0000, 'PLN', 'INCOME',  DATE '2026-09-05', NULL),
    (190, 2, 90, 9999.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', 'never in a profile-1 result');

-- One 1.00 … 30.00 PLN expense per 'Many' child, all on the same day.
INSERT INTO txn (id, profile_id, category_id, amount, currency, txn_type, occurred_on)
OVERRIDING SYSTEM VALUE
SELECT 400 + g, 1, 400 + g, g, 'PLN', 'EXPENSE', DATE '2026-09-03' FROM generate_series(1, 30) AS g;
