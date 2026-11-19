const pool = require('./db/pool');
const fs = require('fs');
const path = require('path');

async function updateSeats() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add new standard seats
    console.log('Adding current standard seats...');
    await client.query(`
      INSERT INTO seats (id, type, zone) VALUES
        ('S23','std','Delta Wing'),
        ('S25','std','Delta Wing'),
        ('S26','std','Bravo Wing')
      ON CONFLICT DO NOTHING
    `);
    
    console.log('Applying current flexi and standard desk layout...');
    const migration = fs.readFileSync(path.join(__dirname, 'db/migrate_current_layout.sql'), 'utf8');
    await client.query(migration);
    
    await client.query('COMMIT');
    
    // Verify the changes
    const result = await client.query(`
      SELECT type, COUNT(*) as count 
      FROM seats
      WHERE active
      GROUP BY type 
      ORDER BY type
    `);
    
    console.log('\n✅ Seats updated successfully!');
    console.log('\nCurrent seat distribution:');
    result.rows.forEach(row => {
      console.log(`  ${row.type}: ${row.count} seats`);
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Update failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

updateSeats();
