-- Category display color (docs/SCHEMA.md "category"): NULL means "inherit from the
-- nearest ancestor with one", resolved client-side. The server only stores and
-- validates the raw lowercase #rrggbb value.

ALTER TABLE category ADD COLUMN color TEXT NULL CHECK (color ~ '^#[0-9a-f]{6}$');
