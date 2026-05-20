#!/usr/bin/env node
// Run: node db/seed.js
// Creates demo users with properly hashed passwords and assigns standard seats.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./pool');

const DEMO_USERS = [
  { name: 'Vinayak Sharma', email: 'vinayak@kuleuven.be', password: 'test123', role: 'user',  seat: 'S1' },
  { name: 'Sofia Chen',     email: 'sofia@kuleuven.be',   password: 'test123', role: 'user',  seat: 'S2' },
  { name: 'Marc Dubois',    email: 'marc@kuleuven.be',    password: 'test123', role: 'user',  seat: 'S3' },
  { name: 'Priya Nair',     email: 'priya@kuleuven.be',   password: 'test123', role: 'user',  seat: 'S4' },
  { name: 'Lars Eriksson',  email: 'lars@kuleuven.be',    password: 'test123', role: 'admin', seat: null },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 12);

      const res = await client.query(
        `INSERT INTO users (name, email, password, role)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role
         RETURNING id`,
        [u.name, u.email, hash, u.role]
      );

      const uid = res.rows[0].id;

      if (u.seat) {
        await client.query(
          `UPDATE seats SET owner_id=$1 WHERE id=$2`,
          [uid, u.seat]
        );
      }

      console.log(`✅  ${u.name} (${u.email}) — role: ${u.role}${u.seat ? ', seat: '+u.seat : ''}`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Seed complete. Login with any email above and password: test123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
