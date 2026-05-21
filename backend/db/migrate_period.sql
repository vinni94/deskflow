-- Migration: add period to bookings for AM/PM split on standard desks
-- Run: psql $DATABASE_URL -f backend/db/migrate_period.sql

-- 1. Add period column (default 'full' for existing/flexi bookings)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'full';

-- 2. Add check constraint
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_period_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_period_check CHECK (period IN ('AM','PM','full'));

-- 3. Replace old UNIQUE(seat_id, date) with UNIQUE(seat_id, date, period)
--    so the same std seat can be booked once for AM and once for PM
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_seat_id_date_key;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_seat_id_date_period_key
    UNIQUE (seat_id, date, period);

-- 4. Update index
DROP INDEX IF EXISTS idx_bookings_seat_date;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_seat_date_period
  ON bookings(seat_id, date, period);
