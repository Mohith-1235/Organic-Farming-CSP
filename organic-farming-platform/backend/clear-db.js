const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'farming.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

const tables = [
  'notifications',
  'order_items',
  'orders',
  'labor_hires',
  'price_history',
  'products',
  'consumers',
  'labors',
  'farmers',
  'users'
];

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function clear() {
  console.log('Dropping all tables to force database re-seeding...');
  // Disable foreign keys temporarily to drop tables without constraints conflicts
  await run('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    try {
      await run(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped table: ${table}`);
    } catch (e) {
      console.error(`Failed to drop table ${table}:`, e.message);
    }
  }
  await run('PRAGMA foreign_keys = ON');
  console.log('All tables dropped successfully.');
  db.close();
}

clear().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
