const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'farming.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, err => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});
const tables = ['users','farmers','labors','consumers','products','orders','order_items','labor_hires','notifications','price_history'];
let index = 0;
function next() {
  if (index >= tables.length) {
    db.close();
    return;
  }
  const table = tables[index++];
  db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
    if (err) {
      console.error(`\n=== ${table} ERROR ===\n`, err.message);
      next();
      return;
    }
    console.log(`\n=== ${table} (${rows.length}) ===`);
    console.log(JSON.stringify(rows, null, 2));
    next();
  });
}
next();
