const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── POST /api/bookings  — create a booking ─────────────────
router.post('/', requireAuth, async (req, res) => {
  const { seatId, date, period } = req.body;
  if (!seatId || !date) return res.status(400).json({ error: 'seatId and date are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (!period || !['AM','PM','full'].includes(period))
    return res.status(400).json({ error: 'period must be AM, PM, or full' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the seat row to prevent race conditions
    const seatRes = await client.query('SELECT * FROM seats WHERE id=$1 FOR UPDATE', [seatId]);
    if (!seatRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Seat not found' });
    }
    const seat = seatRes.rows[0];

    // Validate period vs seat type
    if (seat.type === 'flexi' && period !== 'full') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Flexi desks must be booked for the full day (period: full)' });
    }
    if (seat.type === 'std' && !['AM','PM'].includes(period)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Standard desks must be booked for AM or PM' });
    }

    // Cross-type conflict: user cannot mix flexi and standard bookings on the same day
    if (seat.type === 'flexi') {
      const stdConflict = await client.query(
        `SELECT b.id FROM bookings b
         JOIN seats s ON s.id = b.seat_id
         WHERE b.user_id=$1 AND b.date=$2 AND s.type='std'`,
        [req.user.id, date]
      );
      if (stdConflict.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a standard desk booked that day. Cancel it first to book a flexi desk.' });
      }
    }
    if (seat.type === 'std') {
      const flexiConflict = await client.query(
        `SELECT b.id FROM bookings b
         JOIN seats s ON s.id = b.seat_id
         WHERE b.user_id=$1 AND b.date=$2 AND s.type='flexi'`,
        [req.user.id, date]
      );
      if (flexiConflict.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a flexi desk booked that day. Cancel it first to book a standard desk.' });
      }
    }

    // Check if this seat+date+period is already booked
    const existing = await client.query(
      'SELECT id, user_id FROM bookings WHERE seat_id=$1 AND date=$2 AND period=$3',
      [seatId, date, period]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Seat already booked for this date and period' });
    }

    if (seat.type === 'flexi') {
      // One flexi booking per user per day (full day)
      const userBooking = await client.query(
        `SELECT b.id FROM bookings b
         JOIN seats s ON s.id = b.seat_id
         WHERE b.user_id=$1 AND b.date=$2 AND s.type='flexi'`,
        [req.user.id, date]
      );
      if (userBooking.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a flexi desk booked for this day.' });
      }
    } else {
      // Standard: one booking per user per period per day
      const userBooking = await client.query(
        `SELECT b.id FROM bookings b
         JOIN seats s ON s.id = b.seat_id
         WHERE b.user_id=$1 AND b.date=$2 AND b.period=$3 AND s.type='std'`,
        [req.user.id, date, period]
      );
      if (userBooking.rows.length) {
        await client.query('ROLLBACK');
        const label = period === 'AM' ? 'morning' : 'afternoon';
        return res.status(409).json({ error: `You already have a standard desk booked for the ${label} on this date.` });
      }
    }

    // For standard seats: verify the owner has marked absence for this period
    if (seat.type === 'std') {
      if (!seat.owner_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Standard seat has no assigned owner' });
      }
      if (seat.owner_id === req.user.id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You cannot book your own assigned seat' });
      }
      const absRes = await client.query(
        `SELECT COUNT(*) FROM absences WHERE user_id=$1 AND date=$2 AND period=$3`,
        [seat.owner_id, date, period]
      );
      if (parseInt(absRes.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Seat owner has not marked absence for the ${period} period on this date` });
      }
    }

    const { rows } = await client.query(
      `INSERT INTO bookings (seat_id, user_id, date, period)
       VALUES ($1, $2, $3::date, $4)
       RETURNING id, seat_id, user_id, date::text as date, period`,
      [seatId, req.user.id, date, period]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /bookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/bookings/:id  — cancel a booking ───────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });

    const booking = rows[0];
    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    console.error('DELETE /bookings/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bookings/mine  — current user's bookings ──────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.seat_id, b.date::text as date, b.period, s.type AS seat_type, s.zone
       FROM bookings b
       JOIN seats s ON s.id = b.seat_id
       WHERE b.user_id=$1
       ORDER BY b.date ASC, b.period ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /bookings/mine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bookings?date=YYYY-MM-DD  — admin: all bookings for a date
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.seat_id, b.date::text as date, b.period, b.user_id,
              u.name AS user_name, s.type AS seat_type, s.zone
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN seats s ON s.id = b.seat_id
       WHERE b.date=$1
       ORDER BY b.seat_id, b.period`,
      [date]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /bookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ── GET /api/bookings/seat/:seatId/history — Get booking history for a specific seat
router.get('/seat/:seatId/history', requireAuth, async (req, res) => {
  const { seatId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.seat_id, b.date::text as date, b.period, b.user_id,
              u.name AS booked_by_name, s.type AS seat_type, s.zone,
              CASE WHEN b.date < CURRENT_DATE THEN 'completed' ELSE 'active' END as status
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN seats s ON s.id = b.seat_id
       WHERE b.seat_id = $1
       ORDER BY b.date DESC, b.period
       LIMIT 100`,
      [seatId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /bookings/seat/:seatId/history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
