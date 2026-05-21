const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── GET /api/seats?date=YYYY-MM-DD ──────────────────────────
// Returns all seats enriched with booking + absence status for the given date.
// Flexi desks: single full-day booking (booked_by_id / booking_id).
// Standard desks: separate AM and PM bookings (am_booking_id / pm_booking_id).
router.get('/', requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.type,
         s.zone,
         s.owner_id,
         u.name              AS owner_name,

         -- Flexi: full-day booking (period = 'full')
         fb.id               AS booking_id,
         fb.user_id          AS booked_by_id,
         fbu.name            AS booked_by_name,

         -- Standard AM slot:
         --   use explicit AM booking, OR fall back to a legacy 'full' booking
         COALESCE(amb.id,   lgb.id)        AS am_booking_id,
         COALESCE(amb.user_id, lgb.user_id) AS am_booked_by_id,
         COALESCE(ambu.name,  lgbu.name)   AS am_booked_by_name,

         -- Standard PM slot:
         --   use explicit PM booking, OR fall back to a legacy 'full' booking
         COALESCE(pmb.id,   lgb.id)        AS pm_booking_id,
         COALESCE(pmb.user_id, lgb.user_id) AS pm_booked_by_id,
         COALESCE(pmbu.name,  lgbu.name)   AS pm_booked_by_name,

         -- Owner absence periods for this date
         COALESCE(
           JSON_AGG(a.period) FILTER (WHERE a.period IS NOT NULL),
           '[]'
         )                   AS absent_periods

       FROM seats s
       LEFT JOIN users  u     ON u.id  = s.owner_id
       -- Flexi full-day booking
       LEFT JOIN bookings fb   ON fb.seat_id = s.id AND fb.date = $1
                               AND fb.period = 'full' AND s.type = 'flexi'
       LEFT JOIN users  fbu    ON fbu.id = fb.user_id
       -- Standard AM booking (explicit period)
       LEFT JOIN bookings amb   ON amb.seat_id = s.id AND amb.date = $1
                                AND amb.period = 'AM'
       LEFT JOIN users  ambu    ON ambu.id = amb.user_id
       -- Standard PM booking (explicit period)
       LEFT JOIN bookings pmb   ON pmb.seat_id = s.id AND pmb.date = $1
                                AND pmb.period = 'PM'
       LEFT JOIN users  pmbu    ON pmbu.id = pmb.user_id
       -- Legacy std full-day booking (created before AM/PM split)
       LEFT JOIN bookings lgb   ON lgb.seat_id = s.id AND lgb.date = $1
                                AND lgb.period = 'full' AND s.type = 'std'
       LEFT JOIN users  lgbu    ON lgbu.id = lgb.user_id
       -- Owner absences
       LEFT JOIN absences a ON a.user_id = s.owner_id AND a.date = $1
       GROUP BY s.id, s.type, s.zone, s.owner_id, u.name,
                fb.id, fb.user_id, fbu.name,
                amb.id, amb.user_id, ambu.name,
                pmb.id, pmb.user_id, pmbu.name,
                lgb.id, lgb.user_id, lgbu.name
       ORDER BY s.type DESC,
                SUBSTRING(s.id FROM '[A-Z]+') ASC,
                CAST(SUBSTRING(s.id FROM '[0-9]+') AS INT) ASC`,
      [date]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /seats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: assign owner to a standard seat ─────────────────
router.patch('/:seatId/owner', requireAuth, requireAdmin, async (req, res) => {
  const { seatId } = req.params;
  const { userId } = req.body;    // null to unassign

  try {
    const seat = await pool.query('SELECT * FROM seats WHERE id=$1', [seatId]);
    if (!seat.rows.length) return res.status(404).json({ error: 'Seat not found' });
    if (seat.rows[0].type !== 'std') return res.status(400).json({ error: 'Can only assign standard seats' });

    await pool.query('UPDATE seats SET owner_id=$1 WHERE id=$2', [userId || null, seatId]);
    res.json({ message: 'Owner updated' });
  } catch (err) {
    console.error('PATCH /seats/:id/owner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
