require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const app = express();

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

app.use(cors({
  origin(origin, cb) {
    // Allow non-browser requests (curl, Postman) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// ── BODY PARSING ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── SECURITY HEADERS (lightweight, no helmet dep) ─────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── RATE LIMIT (simple in-memory, no extra dep) ────────────
const hits = new Map();
app.use('/api/auth', (req, res, next) => {
  const ip  = req.ip;
  const now = Date.now();
  const win = 60_000;           // 1 minute window
  const max = 20;               // max 20 auth requests / min / IP

  if (!hits.has(ip)) hits.set(ip, []);
  const times = hits.get(ip).filter(t => now - t < win);
  times.push(now);
  hits.set(ip, times);

  if (times.length > max) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }
  next();
});

// ── ROUTES ──────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/seats',    require('./routes/seats'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/absences', require('./routes/absences'));
app.use('/api/admin',    require('./routes/admin'));

// ── SERVE FRONTEND (production) ─────────────────────────────
// Place your built frontend in ../frontend or adjust the path.
const frontendDir = path.join(__dirname, '../frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ── GLOBAL ERROR HANDLER ────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

// ── START ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, () => {
  console.log(`\n🚀 DeskFlow API running on http://localhost:${PORT}`);
  console.log(`   Frontend served from: ${frontendDir}\n`);
});
