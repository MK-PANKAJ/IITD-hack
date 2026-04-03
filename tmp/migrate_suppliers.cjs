const { pg } = require('../server/services');

async function migrate() {
  console.log('--- Migrating Suppliers Schema ---');
  try {
    await pg.query('ALTER TABLE suppliers ALTER COLUMN country TYPE TEXT');
    console.log('Table suppliers: country column type changed to TEXT.');
    process.exit(0);
  } catch (err) {
    console.error('Migration Error:', err);
    process.exit(1);
  }
}

migrate();
