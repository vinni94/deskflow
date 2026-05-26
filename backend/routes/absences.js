const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

function isBeforeToday(isoDate) { try { const d = new Date(isoDate + 'T00:00:00'); if (isNaN(d)) return false; const t = new Date(); t.setHours(0,0,0,0); return d < t; } catch(e){ return false; } }

// ── GET /api/absences?userId=&weekStart=YYYY-MM-DD ─────────
router.get('/', requireAuth, async (req, res) => {
  const targetId  = req.query.userId || req.user.id;
  const weekStart = req.query.weekStart;
  if (targetId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    let query, params;
    if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      query = `SELECT id, date::text as date, period, absence_type FROM absences
               WHERE user_id=$1 AND date >= $2::date AND date < $2::date + INTERVAL '5 days'
               ORDER BY date, period`;
      params = [targetId, weekStart];
    } else {
      query  = `SELECT id, date::text as date, period, absence_type FROM absences WHERE user_id=$1 ORDER BY date, period`;
      params = [targetId];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /absences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/absences/range?dateFrom=&dateTo= ──────────────
router.get('/range', requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom and dateTo required' });
  try {
    const { rows } = await pool.query(
      `SELECT id, date::text as date, period, absence_type FROM absences
       WHERE user_id=$1 AND date >= $2::date AND date <= $3::date
       ORDER BY date, period`,
      [req.user.id, dateFrom, dateTo]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /absences/range error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/absences/team?weekStart=YYYY-MM-DD ─────────── (admin)
// Returns all users' absences for the requested week (Mon-Fri)
router.get('/team', requireAuth, requireAdmin, async (req, res) => {
  const { weekStart, dateFrom, dateTo } = req.query;
  try {
    let query, params;
    if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      query = `SELECT a.user_id, u.name, a.date, a.period, a.absence_type
               FROM absences a JOIN users u ON u.id = a.user_id
               WHERE a.date >= $1::date AND a.date < $1::date + INTERVAL '5 days'
               ORDER BY u.name, a.date, a.period`;
      params = [weekStart];
    } else if (dateFrom && dateTo) {
      query = `SELECT a.user_id, u.name, a.date, a.period, a.absence_type
               FROM absences a JOIN users u ON u.id = a.user_id
               WHERE a.date >= $1::date AND a.date <= $2::date
               ORDER BY u.name, a.date, a.period`;
      params = [dateFrom, dateTo];
    } else {
      return res.status(400).json({ error: 'weekStart or dateFrom+dateTo required' });
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /absences/team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/absences — mark absence (single or range) ────
// Body: { date, period, absence_type }  — single
//       { dateFrom, dateTo, period, absence_type }  — range
// period: 'AM' | 'PM' | 'full' (default: 'full' = both)
router.post('/', requireAuth, async (req, res) => {
  const { date, period, absence_type, dateFrom, dateTo } = req.body;
  const validTypes   = ['wfh', 'abroad', 'holiday', 'mission', 'institute'];
  const validPeriods = ['AM', 'PM', 'full'];
  const atype  = absence_type || 'wfh';
  const aperiod = period || 'full';

  if (!validTypes.includes(atype))    return res.status(400).json({ error: 'absence_type must be wfh, abroad, holiday, mission, or institute' });
  if (!validPeriods.includes(aperiod)) return res.status(400).json({ error: 'period must be AM, PM, or full' });

  // Which DB periods to write
  const dbPeriods = aperiod === 'full' ? ['AM', 'PM'] : [aperiod];

  try {
    if (dateFrom && dateTo) {
      if (isBeforeToday(dateFrom) || isBeforeToday(dateTo)) return res.status(400).json({ error: 'Dates must be today or later' });
      // Validate date format
      if (isNaN(new Date(dateFrom)) || isNaN(new Date(dateTo))) return res.status(400).json({ error: 'Invalid date range' });

      const inserted = [];
      // Work with date strings directly using pure arithmetic
      function getDayOfWeek(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const K = y % 100;
        const J = Math.floor(y / 100);
        let h = (d + Math.floor(13*(m+1)/5) + K + Math.floor(K/4) + Math.floor(J/4) - 2*J) % 7;
        return (h + 6) % 7;
      }
      
      function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      }
      
      function daysInMonth(year, month) {
        const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (month === 2 && isLeapYear(year)) return 29;
        return daysPerMonth[month - 1];
      }
      
      function addDaysString(dateStr, days) {
        let [y, m, d] = dateStr.split('-').map(Number);
        d += days;
        while (d > daysInMonth(y, m)) {
          d -= daysInMonth(y, m);
          m++;
          if (m > 12) {
            m = 1;
            y++;
          }
        }
        return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
      
      let current = dateFrom;
      while (current <= dateTo) {
        const dow = getDayOfWeek(current);
        console.log('[ABSENCE] Iterating date:', current, 'dow:', dow);
        if (dow !== 0 && dow !== 6) {
          const dk = current;
          console.log('[ABSENCE] Inserting date:', dk);        for (const p of dbPeriods) {
          const { rows } = await pool.query(
            `INSERT INTO absences (user_id, date, period, absence_type)
             VALUES ($1, $2::date, $3, $4)
             ON CONFLICT (user_id, date, period)
             DO UPDATE SET absence_type = EXCLUDED.absence_type
             RETURNING id, date::text as date, period, absence_type`,
            [req.user.id, dk, p, atype]
          );
          console.log("[ABSENCE] INSERT result:", rows.length, "rows, date:", rows[0]?.date);
          if (rows[0]) inserted.push(rows[0]);
        }
        }
        current = addDaysString(current, 1);
      }
      return res.status(201).json(inserted);
    }

    // Single date
    if (!date) return res.status(400).json({ error: 'date required' });
    if (isBeforeToday(date)) return res.status(400).json({ error: 'Date must be today or later' });
    if (isBeforeToday(date)) return res.status(400).json({ error: 'Date must be today or later' });
    const inserted = [];
    for (const p of dbPeriods) {
      const { rows } = await pool.query(
        `INSERT INTO absences (user_id, date, period, absence_type)
         VALUES ($1, $2::date, $3, $4)
         ON CONFLICT (user_id, date, period)
         DO UPDATE SET absence_type = EXCLUDED.absence_type
         RETURNING id, date::text as date, period, absence_type`,
        [req.user.id, date, p, atype]
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    res.status(201).json(inserted.length === 1 ? inserted[0] : inserted);
  } catch (err) {
    console.error('POST /absences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/absences — remove absence (single or range) ─
// Body: { date, period }  — single (period: AM|PM|full)
//       { dateFrom, dateTo, period }  — range
router.delete('/', requireAuth, async (req, res) => {
  const { date, period, dateFrom, dateTo } = req.body;
  const aperiod = period || 'full';

  try {
    if (dateFrom && dateTo) {
      if (isBeforeToday(dateFrom) || isBeforeToday(dateTo)) return res.status(400).json({ error: 'Dates must be today or later' });
      if (aperiod === 'full') {
        await pool.query(
          `DELETE FROM absences WHERE user_id=$1 AND date >= $2::date AND date <= $3::date`,
          [req.user.id, dateFrom, dateTo]
        );
      } else {
        await pool.query(
          `DELETE FROM absences WHERE user_id=$1 AND date >= $2::date AND date <= $3::date AND period=$4`,
          [req.user.id, dateFrom, dateTo, aperiod]
        );
      }
      return res.json({ message: 'Absences removed' });
    }

    if (!date) return res.status(400).json({ error: 'date required' });
    if (isBeforeToday(date)) return res.status(400).json({ error: 'Date must be today or later' });
    if (aperiod === 'full') {
      await pool.query(`DELETE FROM absences WHERE user_id=$1 AND date=$2`, [req.user.id, date]);
    } else {
      await pool.query(`DELETE FROM absences WHERE user_id=$1 AND date=$2 AND period=$3`, [req.user.id, date, aperiod]);
    }
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
      `SELECT a.user_id, u.name, a.date, a.period, a.absence_type
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
