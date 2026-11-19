-- Requires migrate_seat_active.sql on databases without seats.active.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seats
    WHERE (id IN ('F2', 'F3', 'F4') AND type <> 'flexi')
       OR (id = 'S24' AND type <> 'std')
  ) THEN
    RAISE EXCEPTION 'Existing seat type conflicts with the new layout';
  END IF;

  INSERT INTO seats (id, type, zone)
  VALUES ('F2', 'flexi', 'Flexi Zone'),
         ('F3', 'flexi', 'Flexi Zone'),
         ('F4', 'flexi', 'Flexi Zone')
  ON CONFLICT (id) DO UPDATE SET active = TRUE;

  UPDATE seats SET active = FALSE WHERE id = 'S24';
END $$;
