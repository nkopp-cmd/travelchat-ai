-- Supabase exit gate 2 (shared/plans/localley-decisions.md 2026-10-24): every facade/RPC write appends the changed rows'
-- identifying columns (primary key, or the upsert conflict key) here in the same D1 batch. A rollback replays it in seq order into Supabase: upsert the current D1 row,
-- or delete it when the row no longer exists. Append-only; table_name is the Postgres table.
CREATE TABLE _journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  table_name TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  pk TEXT NOT NULL CHECK (json_valid(pk) AND json_type(pk) = 'object')
);
