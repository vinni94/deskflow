const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All routes require admin
router.use(requireAuth, requireAdmin);

// GET /api/admin/users - Get all users with their seat assignments
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role,
        u.created_at,
        s.id as seat_id,
        s.type as seat_type,
        s.zone as seat_zone
      FROM users u
      LEFT JOIN seats s ON s.owner_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/seats/:seatId/assign - Assign a user to a seat
router.put('/seats/:seatId/assign', async (req, res) => {
  const { seatId } = req.params;
  const { userId } = req.body;
  
  if (!userId) return res.status(400).json({ error: 'userId required' });
  
  try {
    const seatCheck = await pool.query('SELECT id, type, owner_id FROM seats WHERE id = $1', [seatId]);
    if (seatCheck.rows.length === 0) return res.status(404).json({ error: 'Seat not found' });
    if (seatCheck.rows[0].type !== 'std') return res.status(400).json({ error: 'Can only assign users to standard seats' });
    if (seatCheck.rows[0].owner_id) return res.status(400).json({ error: 'Seat already assigned' });
    
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const existingSeat = await pool.query('SELECT id FROM seats WHERE owner_id = $1 AND type = $2', [userId, 'std']);
    if (existingSeat.rows.length > 0) {
      return res.status(400).json({ error: 'User already has a standard seat', currentSeat: existingSeat.rows[0].id });
    }
    
    await pool.query('UPDATE seats SET owner_id = $1 WHERE id = $2', [userId, seatId]);
    res.json({ success: true, message: 'Seat assigned successfully' });
  } catch (err) {
    console.error('PUT /admin/seats/:seatId/assign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/seats/:seatId/unassign - Unassign user from seat
router.delete('/seats/:seatId/unassign', async (req, res) => {
  const { seatId } = req.params;
  
  try {
    const seatCheck = await pool.query('SELECT id, owner_id FROM seats WHERE id = $1', [seatId]);
    if (seatCheck.rows.length === 0) return res.status(404).json({ error: 'Seat not found' });
    if (!seatCheck.rows[0].owner_id) return res.status(400).json({ error: 'Seat not assigned' });
    
    await pool.query('UPDATE seats SET owner_id = NULL WHERE id = $1', [seatId]);
    res.json({ success: true, message: 'Seat unassigned successfully' });
  } catch (err) {
    console.error('DELETE /admin/seats/:seatId/unassign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  try {
    const [seatsResult, usersResult, bookingsResult, absencesResult] = await Promise.all([
      pool.query('SELECT type, COUNT(*) as count FROM seats GROUP BY type'),
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM bookings WHERE date = $1', [targetDate]),
      pool.query('SELECT COUNT(DISTINCT user_id) as count FROM absences WHERE date = $1', [targetDate])
    ]);
    
    const seatCounts = {};
    seatsResult.rows.forEach(r => seatCounts[r.type] = parseInt(r.count));
    
    const stats = {
      totalSeats: (seatCounts.flexi || 0) + (seatCounts.std || 0),
      flexiSeats: seatCounts.flexi || 0,
      stdSeats: seatCounts.std || 0,
      totalUsers: parseInt(usersResult.rows[0].count),
      bookingsToday: parseInt(bookingsResult.rows[0].count),
      absentsToday: parseInt(absencesResult.rows[0].count)
    };
    
    res.json(stats);
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
