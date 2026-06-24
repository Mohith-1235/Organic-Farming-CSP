const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'farming.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Helper wrappers to use Promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initializeDatabase() {
  try {
    // Enable foreign keys
    await run('PRAGMA foreign_keys = ON');

    // 1. Users Table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('farmer', 'labor', 'consumer')) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Farmers Table
    await run(`
      CREATE TABLE IF NOT EXISTS farmers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        farm_name TEXT NOT NULL,
        farm_details TEXT,
        location TEXT NOT NULL,
        phone TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 3. Labors Table
    await run(`
      CREATE TABLE IF NOT EXISTS labors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        experience_years INTEGER NOT NULL,
        payment_expectation REAL NOT NULL,
        wage_type TEXT CHECK(wage_type IN ('weekly', 'monthly')) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 4. Consumers Table
    await run(`
      CREATE TABLE IF NOT EXISTS consumers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 5. Products Table (Farmer listing)
    await run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farmer_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        unit TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farmer_id) REFERENCES farmers (id) ON DELETE CASCADE
      )
    `);

    // 6. Price History Table
    await run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        price REAL NOT NULL,
        change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      )
    `);

    // 7. Labor Hires Table
    await run(`
      CREATE TABLE IF NOT EXISTS labor_hires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farmer_id INTEGER NOT NULL,
        labor_id INTEGER NOT NULL,
        status TEXT CHECK(status IN ('pending', 'hired', 'rejected', 'completed')) DEFAULT 'pending',
        hire_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        FOREIGN KEY (farmer_id) REFERENCES farmers (id) ON DELETE CASCADE,
        FOREIGN KEY (labor_id) REFERENCES labors (id) ON DELETE CASCADE
      )
    `);

    // 8. Orders Table
    await run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consumer_id INTEGER NOT NULL,
        farmer_id INTEGER NOT NULL,
        total_price REAL NOT NULL,
        status TEXT CHECK(status IN ('pending', 'completed', 'cancelled', 'placed', 'confirmed', 'processing', 'shipped', 'delivered')) DEFAULT 'placed',
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consumer_id) REFERENCES consumers (id) ON DELETE CASCADE,
        FOREIGN KEY (farmer_id) REFERENCES farmers (id) ON DELETE CASCADE
      )
    `);

    // 9. Order Items Table
    await run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        price_at_purchase REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      )
    `);

    // 10. Notifications Table
    await run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        phone TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 11. FCM Tokens Table (Firebase Cloud Messaging device tokens)
    await run(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Run schema migrations for existing orders and farmers tables
    try {
      await run("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cod'");
    } catch (e) {
      // already exists
    }
    try {
      await run("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'");
    } catch (e) {
      // already exists
    }
    try {
      await run("ALTER TABLE farmers ADD COLUMN phone TEXT DEFAULT ''");
    } catch (e) {
      // already exists
    }
    try {
      await run("ALTER TABLE orders ADD COLUMN alert_phone TEXT");
    } catch (e) {
      // already exists
    }

    console.log('Tables initialized successfully.');
    
    // Seed Database if empty
    await seedDatabase();
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}

async function seedDatabase() {
  try {
    const userCount = await get('SELECT COUNT(*) as count FROM users');
    if (userCount.count > 0) {
      console.log('Database already seeded. Skipping.');
      return;
    }

    console.log('Seeding initial mock data...');

    // 1. Seed Users (passwords are stored as plain text for simple development demonstration)
    const farmersUser = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['farmer1', 'pass123', 'farmer']);
    const farmer2User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['farmer2', 'pass123', 'farmer']);
    const labor1User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['labor1', 'pass123', 'labor']);
    const labor2User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['labor2', 'pass123', 'labor']);
    const labor3User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['labor3', 'pass123', 'labor']);
    const consumer1User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['consumer1', 'pass123', 'consumer']);
    const consumer2User = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['consumer2', 'pass123', 'consumer']);

    // 2. Seed Farmers Profiles
    const farmer1 = await run('INSERT INTO farmers (user_id, farm_name, farm_details, location, phone) VALUES (?, ?, ?, ?, ?)', [
      farmersUser.id,
      'Green Valley Organic Farm',
      'Specializing in fresh greens, root vegetables, and berries. Certified organic since 2018.',
      'Bangalore',
      '+91 99000 11223'
    ]);
    const farmer2 = await run('INSERT INTO farmers (user_id, farm_name, farm_details, location, phone) VALUES (?, ?, ?, ?, ?)', [
      farmer2User.id,
      'Sunrise Agri Fields',
      'High quality pulses, grains, and seasonal organic fruits.',
      'Mysore',
      '+91 88000 44556'
    ]);

    // 3. Seed Labors Profiles
    const labor1 = await run('INSERT INTO labors (user_id, name, phone, location, experience_years, payment_expectation, wage_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      labor1User.id,
      'Ramesh Kumar',
      '+91 98765 43210',
      'Bangalore',
      5,
      450.0,
      'weekly' // Note: storing 450 per day (so let's treat expected wages as wage rate in UI, e.g. weekly/monthly base rate)
    ]);
    // Let's refine wage: 450 is daily wage paid weekly, or weekly expectation. Let's make it wage rate: e.g., 2500 per week, 12000 per month.
    await run('UPDATE labors SET payment_expectation = 3000 WHERE id = 1'); // 3000 per week

    const labor2 = await run('INSERT INTO labors (user_id, name, phone, location, experience_years, payment_expectation, wage_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      labor2User.id,
      'Suresh Singh',
      '+91 87654 32109',
      'Bangalore',
      3,
      2800.0,
      'weekly'
    ]);
    const labor3 = await run('INSERT INTO labors (user_id, name, phone, location, experience_years, payment_expectation, wage_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      labor3User.id,
      'Anita Devi',
      '+91 76543 21098',
      'Mysore',
      8,
      14000.0,
      'monthly'
    ]);

    // 4. Seed Consumers Profiles
    const consumer1 = await run('INSERT INTO consumers (user_id, name, phone, delivery_address) VALUES (?, ?, ?, ?)', [
      consumer1User.id,
      'Pavan Kalyan',
      '+91 95555 44444',
      '#42, 3rd Cross, Indiranagar, Bangalore'
    ]);
    const consumer2 = await run('INSERT INTO consumers (user_id, name, phone, delivery_address) VALUES (?, ?, ?, ?)', [
      consumer2User.id,
      'Aditi Rao',
      '+91 94444 33333',
      'Greenwood Apts, Sector 4, Mysore'
    ]);

    // 5. Seed Products for Farmer 1
    const p1 = await run('INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      farmer1.id,
      'Organic Tomatoes',
      'Vegetables',
      45.0,
      'kg',
      'Freshly harvested, vine-ripened organic red tomatoes.',
      'https://images.unsplash.com/photo-1595855759920-86582396756a?auto=format&fit=crop&w=600&q=80'
    ]);
    const p2 = await run('INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      farmer1.id,
      'Fresh Spinach (Palak)',
      'Vegetables',
      25.0,
      'bunch',
      'Iron-rich, pesticide-free crispy spinach bunches.',
      'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80'
    ]);
    const p3 = await run('INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      farmer1.id,
      'Organic Strawberries',
      'Fruits',
      180.0,
      'box',
      'Sweet and juicy locally grown organic strawberries.',
      'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=600&q=80'
    ]);

    // Seed Products for Farmer 2
    const p4 = await run('INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      farmer2.id,
      'Basmati Rice (Premium)',
      'Grains',
      95.0,
      'kg',
      'Aged long-grain basmati rice grown using organic practices.',
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80'
    ]);
    const p5 = await run('INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      farmer2.id,
      'Organic Moong Dal',
      'Pulses',
      140.0,
      'kg',
      'Unpolished, organic yellow moong split lentils.',
      'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=600&q=80'
    ]);

    // 6. Seed Price History for Tomatoes (p1) to show day-wise trends
    const now = new Date();
    const daysAgo = (num) => new Date(now.getTime() - num * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p1.id, 40.0, daysAgo(4)]);
    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p1.id, 42.0, daysAgo(3)]);
    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p1.id, 41.5, daysAgo(2)]);
    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p1.id, 45.0, daysAgo(0)]);

    // Seed Price History for Moong Dal (p5)
    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p5.id, 135.0, daysAgo(5)]);
    await run('INSERT INTO price_history (product_id, price, change_date) VALUES (?, ?, ?)', [p5.id, 140.0, daysAgo(0)]);

    // 7. Seed Labor Hires (Ramesh Kumar is requested by Green Valley)
    await run('INSERT INTO labor_hires (farmer_id, labor_id, status, remarks) VALUES (?, ?, ?, ?)', [
      farmer1.id,
      1, // Ramesh
      'pending',
      'Need weeding and compost management for the spinach beds.'
    ]);

    // Suresh has been hired already
    await run('INSERT INTO labor_hires (farmer_id, labor_id, status, remarks) VALUES (?, ?, ?, ?)', [
      farmer1.id,
      2, // Suresh
      'hired',
      'Harvest assistance.'
    ]);

    // 8. Seed consumer order
    const order1 = await run('INSERT INTO orders (consumer_id, farmer_id, total_price, status, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?)', [
      1, // Pavan
      farmer1.id,
      205.0,
      'delivered',
      'upi',
      'paid'
    ]);
    await run('INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)', [
      order1.id,
      p1.id, // Tomatoes
      2, // 2kg
      45.0 // total 90
    ]);
    await run('INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)', [
      order1.id,
      p2.id, // Spinach
      1, // 1 bunch
      25.0 // total 25
    ]);
    await run('INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)', [
      order1.id,
      p3.id, // Strawberries
      0.5, // 0.5 box? or 1 box. Let's say 1 box
      90.0 // total 90
    ]);
    // Fix purchase price
    await run('UPDATE order_items SET quantity = 1, price_at_purchase = 180 WHERE id = 3');
    await run('UPDATE orders SET total_price = 295 WHERE id = 1');

    console.log('Database seeded successfully with initial data.');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

module.exports = {
  db,
  run,
  get,
  all
};
