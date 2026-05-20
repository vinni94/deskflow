const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── GET /api/seats?date=YYYY-MM-DD ──────────────────────────
// Returns all seats enriched with booking + absence status for the given date.
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
         u.name            AS owner_name,

         -- booking for this date
         b.id              AS booking_id,
         b.user_id         AS booked_by_id,
         bu.name           AS booked_by_name,

         -- owner absence periods for this date (aggregated)
         COALESCE(
           JSON_AGG(a.period) FILTER (WHERE a.period IS NOT NULL),
           '[]'
         )                 AS absent_periods

       FROM seats s
       LEFT JOIN users  u  ON u.id  = s.owner_id
       LEFT JOIN bookings b ON b.seat_id = s.id AND b.date = $1
       LEFT JOIN users  bu ON bu.id = b.user_id
       LEFT JOIN absences a ON a.user_id = s.owner_id AND a.date = $1
       GROUP BY s.id, s.type, s.zone, s.owner_id, u.name,
                b.id, b.user_id, bu.name
       ORDER BY s.type DESC, s.id`,
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

    // Unassign any existing owner for this seat first
    await pool.query('UPDATE seats SET owner_id=$1 WHERE id=$2', [userId || null, seatId]);
    res.json({ message: 'Owner updated' });
  } catch (err) {
    console.error('PATCH /seats/:id/owner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
