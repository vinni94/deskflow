const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/users/search?q= ────────────────────────────────
// Returns users matching search query (accessible to all authenticated users)
router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  try {
    let query, params;
    if (q && q.trim()) {
      query = `SELECT u.id, u.name, u.email, s.id AS seat_id
               FROM users u
               LEFT JOIN seats s ON s.owner_id = u.id
               WHERE LOWER(u.name) LIKE LOWER($1) OR LOWER(u.email) LIKE LOWER($1)
               ORDER BY u.name
               LIMIT 20`;
      params = [`%${q.trim()}%`];
    } else {
      query = `SELECT u.id, u.name, u.email, s.id AS seat_id
               FROM users u
               LEFT JOIN seats s ON s.owner_id = u.id
               ORDER BY u.name
               LIMIT 50`;
      params = [];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /users/search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────
// Returns a specific user's info (accessible to all authenticated users)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, s.id AS seat_id
       FROM users u
       LEFT JOIN seats s ON s.owner_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
