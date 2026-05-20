const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── GET /api/absences?userId=&weekStart=YYYY-MM-DD ─────────
// Returns absences for a user across the week (Mon–Fri).
// Regular users can only fetch their own; admins can query anyone.
router.get('/', requireAuth, async (req, res) => {
  const targetId  = req.query.userId || req.user.id;
  const weekStart = req.query.weekStart;

  if (targetId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  try {
    let query, params;
    if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      // Return Mon–Fri of the given week
      query = `SELECT id, date, period FROM absences
               WHERE user_id=$1
                 AND date >= $2::date
                 AND date <  $2::date + INTERVAL '5 days'
               ORDER BY date, period`;
      params = [targetId, weekStart];
    } else {
      query  = `SELECT id, date, period FROM absences WHERE user_id=$1 ORDER BY date, period`;
      params = [targetId];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /absences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/absences  — mark absence ────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { date, period } = req.body;
  if (!date || !period) return res.status(400).json({ error: 'date and period required' });
  if (!['AM','PM'].includes(period)) return res.status(400).json({ error: 'period must be AM or PM' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO absences (user_id, date, period)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, date, period) DO NOTHING
       RETURNING id, date, period`,
      [req.user.id, date, period]
    );
    // If DO NOTHING fired, the absence already existed — still 200
    res.status(201).json(rows[0] || { date, period, already: true });
  } catch (err) {
    console.error('POST /absences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/absences  — remove absence ─────────────────
router.delete('/', requireAuth, async (req, res) => {
  const { date, period } = req.body;
  if (!date || !period) return res.status(400).json({ error: 'date and period required' });

  try {
    await pool.query(
      `DELETE FROM absences WHERE user_id=$1 AND date=$2 AND period=$3`,
      [req.user.id, date, period]
    );
    res.json({ message: 'Absence removed' });
  } catch (err) {
    console.error('DELETE /absences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/absences/all?date=YYYY-MM-DD  — admin ─────────
router.get('/all', requireAuth, requireAdmin, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  try {
    const { rows } = await pool.query(
      `SELECT a.user_id, u.name, a.date, a.period
       FROM absences a JOIN users u ON u.id=a.user_id
       WHERE a.date=$1 ORDER BY u.name, a.period`,
      [date]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /absences/all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
