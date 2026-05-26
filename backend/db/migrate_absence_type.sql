-- Migration: add absence_type column to absences table
-- Run: psql $DATABASE_URL -f backend/db/migrate_absence_type.sql

-- 1. Add absence_type column (default 'wfh' for existing absences)
ALTER TABLE absences
  ADD COLUMN IF NOT EXISTS absence_type TEXT NOT NULL DEFAULT 'wfh';

-- 2. Add check constraint
ALTER TABLE absences
  DROP CONSTRAINT IF EXISTS absences_absence_type_check;
ALTER TABLE absences
  ADD CONSTRAINT absences_absence_type_check 
    CHECK (absence_type IN ('wfh','abroad','holiday','mission','institute'));
