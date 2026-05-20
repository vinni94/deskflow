const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// ── GET /api/admin/users ────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              s.id AS seat_id
       FROM users u
       LEFT JOIN seats s ON s.owner_id = u.id
       ORDER BY u.created_at`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/stats?date=YYYY-MM-DD ──────────────────
router.get('/stats', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  try {
    const [totalSeats, flexiSeats, stdSeats, totalUsers, bookingsToday, absencesToday] =
      await Promise.all([
        pool.query('SELECT COUNT(*) FROM seats'),
        pool.query("SELECT COUNT(*) FROM seats WHERE type='flexi'"),
        pool.query("SELECT COUNT(*) FROM seats WHERE type='std'"),
        pool.query('SELECT COUNT(*) FROM users'),
        pool.query('SELECT COUNT(*) FROM bookings WHERE date=$1', [date]),
        pool.query(
          `SELECT COUNT(DISTINCT user_id) FROM absences WHERE date=$1`,
          [date]
        ),
      ]);

    res.json({
      totalSeats:    parseInt(totalSeats.rows[0].count),
      flexiSeats:    parseInt(flexiSeats.rows[0].count),
      stdSeats:      parseInt(stdSeats.rows[0].count),
      totalUsers:    parseInt(totalUsers.rows[0].count),
      bookingsToday: parseInt(bookingsToday.rows[0].count),
      absentsToday:  parseInt(absencesToday.rows[0].count),
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/users/:id/role ───────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  try {
    const { rows } = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, email, role',
      [role, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
