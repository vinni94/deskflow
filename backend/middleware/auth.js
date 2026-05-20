const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

/**
 * requireAuth  — verifies JWT from Authorization: Bearer <token>
 * Attaches req.user = { id, email, name, role } on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (catches deleted / role-changed users)
    const { rows } = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id=$1',
      [payload.sub]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * requireAdmin  — must be used after requireAuth
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
