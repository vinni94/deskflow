-- DeskFlow PostgreSQL Schema
-- Run: psql -U postgres -d deskflow -f schema.sql

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  password    TEXT        NOT NULL,        -- bcrypt hash
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seats (
  id          TEXT        PRIMARY KEY,     -- e.g. 'F1', 'S1'
  type        TEXT        NOT NULL CHECK (type IN ('flexi','std')),
  zone        TEXT        NOT NULL,
  owner_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS absences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  period      TEXT        NOT NULL CHECK (period IN ('AM','PM')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date, period)
);

CREATE TABLE IF NOT EXISTS bookings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id     TEXT        NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(seat_id, date)   -- one booking per seat per day
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_absences_user_date  ON absences(user_id, date);
CREATE INDEX IF NOT EXISTS idx_absences_date        ON absences(date);
CREATE INDEX IF NOT EXISTS idx_bookings_date        ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_date   ON bookings(user_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_seat_date   ON bookings(seat_id, date);

-- ============================================================
-- SEED: SEATS
-- ============================================================
INSERT INTO seats (id, type, zone) VALUES
  ('F1','flexi','Flexi Zone'),
  ('F2','flexi','Flexi Zone'),
  ('F3','flexi','Flexi Zone'),
  ('F4','flexi','Flexi Zone'),
  ('F5','flexi','Flexi Zone'),
  ('F6','flexi','Flexi Zone'),
  ('F7','flexi','Flexi Zone'),
  ('F8','flexi','Flexi Zone'),
  ('S1','std','Alpha Wing'),
  ('S2','std','Alpha Wing'),
  ('S3','std','Alpha Wing'),
  ('S4','std','Alpha Wing'),
  ('S5','std','Bravo Wing'),
  ('S6','std','Bravo Wing'),
  ('S7','std','Bravo Wing'),
  ('S8','std','Bravo Wing'),
  ('S9','std','Bravo Wing'),
  ('S10','std','Bravo Wing'),
  ('S11','std','Charlie Wing'),
  ('S12','std','Charlie Wing'),
  ('S13','std','Charlie Wing'),
  ('S14','std','Charlie Wing'),
  ('S15','std','Charlie Wing'),
  ('F9','flexi','Flexi Zone'),
  ('F10','flexi','Flexi Zone')
ON CONFLICT DO NOTHING;

-- NOTE: User seeds are handled by the application seed script (npm run seed)
-- because we need bcrypt hashing. See seed.js.
