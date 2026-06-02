const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://deskflow_3dj4_user:uaN3WnPXsNfUHU8XAUlznWucWCSY6vh0@dpg-d87lqjul51nc7393ge80-a.frankfurt-postgres.render.com/deskflow_3dj4',
  ssl: { rejectUnauthorized: false }
});

async function updateSeats() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add new standard seats
    console.log('Adding new standard seats S16-S22...');
    await client.query(`
      INSERT INTO seats (id, type, zone) VALUES
        ('S16','std','Charlie Wing'),
        ('S17','std','Delta Wing'),
        ('S18','std','Delta Wing'),
        ('S19','std','Delta Wing'),
        ('S20','std','Delta Wing'),
        ('S21','std','Delta Wing'),
        ('S22','std','Delta Wing')
      ON CONFLICT DO NOTHING
    `);
    
    // Remove old flexi desks F5-F10
    console.log('Removing flexi desks F5-F10...');
    await client.query(`
      DELETE FROM seats WHERE id IN ('F5','F6','F7','F8','F9','F10')
    `);
    
    await client.query('COMMIT');
    
    // Verify the changes
    const result = await client.query(`
      SELECT type, COUNT(*) as count 
      FROM seats 
      GROUP BY type 
      ORDER BY type
    `);
    
    console.log('\n✅ Render database seats updated successfully!');
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
