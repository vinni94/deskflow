-- Run before deploying code that uses seats.active.
ALTER TABLE seats ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
