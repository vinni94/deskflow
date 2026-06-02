-- cleanup_old_absences.sql
-- Delete absence records older than 1 year
-- Run this periodically or as a scheduled job

DELETE FROM absences 
WHERE date < CURRENT_DATE - INTERVAL '1 year';

-- To see how many records would be deleted before running, use:
-- SELECT COUNT(*) FROM absences WHERE date < CURRENT_DATE - INTERVAL '1 year';
