const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── POST /api/bookings  — create a booking ─────────────────
router.post('/', requireAuth, async (req, res) => {
  const { seatId, date } = req.body;
  if (!seatId || !date) return res.status(400).json({ error: 'seatId and date are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the seat row to prevent race conditions
    const seatRes = await client.query(
      'SELECT * FROM seats WHERE id=$1 FOR UPDATE',
      [seatId]
    );
    if (!seatRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Seat not found' });
    }
    const seat = seatRes.rows[0];

    // Check if seat already booked for this date
    const existing = await client.query(
      'SELECT id, user_id FROM bookings WHERE seat_id=$1 AND date=$2',
      [seatId, date]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Seat already booked for this date' });
    }

    // One booking per user per day
    const userBooking = await client.query(
      'SELECT id FROM bookings WHERE user_id=$1 AND date=$2',
      [req.user.id, date]
    );
    if (userBooking.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have a booking on this date. Cancel it first to book a different seat.' });
    }
    // For standard seats: verify the owner has marked absence
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
        `SELECT COUNT(*) FROM absences WHERE user_id=$1 AND date=$2`,
        [seat.owner_id, date]
      );
      if (parseInt(absRes.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Seat owner has not marked absence for this date' });
      }
    }

    const { rows } = await client.query(
      `INSERT INTO bookings (seat_id, user_id, date)
       VALUES ($1,$2,$3)
       RETURNING id, seat_id, user_id, date`,
      [seatId, req.user.id, date]
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
    const { rows } = await pool.query(
      'SELECT * FROM bookings WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });

    const booking = rows[0];
    // Only the booker or an admin can cancel
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
      `SELECT b.id, b.seat_id, b.date, s.type AS seat_type, s.zone
       FROM bookings b
       JOIN seats s ON s.id = b.seat_id
       WHERE b.user_id=$1
       ORDER BY b.date ASC`,
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
      `SELECT b.id, b.seat_id, b.date, b.user_id,
              u.name AS user_name, s.type AS seat_type, s.zone
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN seats s ON s.id = b.seat_id
       WHERE b.date=$1
       ORDER BY b.seat_id`,
      [date]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /bookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
