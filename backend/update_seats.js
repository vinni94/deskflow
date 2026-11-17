const pool = require('./db/pool');

async function updateSeats() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add new standard seats
    console.log('Adding new standard seats S23-S26...');
    await client.query(`
      INSERT INTO seats (id, type, zone) VALUES
        ('S23','std','Delta Wing'),
        ('S24','std','Delta Wing'),
        ('S25','std','Delta Wing'),
        ('S26','std','Bravo Wing')
      ON CONFLICT DO NOTHING
    `);
    
    console.log('Retiring flexi desks other than F1...');
    await client.query(`
      UPDATE seats SET active = FALSE WHERE type = 'flexi' AND id <> 'F1'
    `);
    
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
