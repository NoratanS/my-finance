-- Merchant on transactions (docs/SCHEMA.md "txn"): free text, typed in the transaction form or
-- backfilled from repeating descriptions. It is the categorical axis of the Insights merchant
-- dimension (docs/INSIGHTS.md "Plan DSL v1"), where NULL renders as "Unspecified".

ALTER TABLE txn ADD COLUMN merchant TEXT NULL CHECK (char_length(merchant) <= 100);
