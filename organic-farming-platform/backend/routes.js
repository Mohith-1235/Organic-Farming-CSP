const express = require('express');
const router = express.Router();
const db = require('./database');
const fcm = require('./fcm');
const { sendSMS } = require('./sms');

// Helper to send notifications (DB + FCM push + real SMS)
async function sendNotification(userId, phone, message, type) {
  try {
    // 1. Save notification to database
    await db.run(
      'INSERT INTO notifications (user_id, phone, message, type) VALUES (?, ?, ?, ?)',
      [userId, phone, message, type]
    );
    console.log(`\n========================================`);
    console.log(`[NOTIFICATION → ${phone}]`);
    console.log(`Message: "${message}"`);
    console.log(`========================================\n`);

    // 2. Send REAL SMS to the user's phone number
    if (phone && phone !== 'N/A') {
      sendSMS(phone, message).then(sent => {
        if (sent) {
          console.log(`[SMS] ✅ Real SMS delivered to ${phone}`);
        } else {
          console.log(`[SMS] ⚠️ SMS not delivered (check FAST2SMS_API_KEY in .env)`);
        }
      }).catch(err => {
        console.error('[SMS] Error:', err.message);
      });
    }

    // 3. Send FCM push notification (if configured)
    try {
      const title = 'BioFarm Alert 🌾';
      await fcm.sendFCMToUser(db, userId, title, message, { type });
    } catch (fcmErr) {
      console.log('[FCM] Push skipped:', fcmErr.message);
    }
  } catch (err) {
    console.error('Error sending notification:', err.message);
  }
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Register
router.post('/auth/register', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Insert user
    const userResult = await db.run(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, password, role]
    );
    const userId = userResult.id;

    // Create default profile based on role
    if (role === 'farmer') {
      await db.run(
        'INSERT INTO farmers (user_id, farm_name, farm_details, location) VALUES (?, ?, ?, ?)',
        [userId, `${username}'s Organic Farm`, 'Welcome to my organic farm page.', 'Unknown']
      );
    } else if (role === 'labor') {
      await db.run(
        'INSERT INTO labors (user_id, name, phone, location, experience_years, payment_expectation, wage_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, username, '', 'Unknown', 0, 0.0, 'weekly']
      );
    } else if (role === 'consumer') {
      await db.run(
        'INSERT INTO consumers (user_id, name, phone, delivery_address) VALUES (?, ?, ?, ?)',
        [userId, username, '', 'Unknown']
      );
    }

    res.status(201).json({ id: userId, username, role, message: 'Registration successful' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Database error during registration' });
    }
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Fetch profile details
    let profile = null;
    if (user.role === 'farmer') {
      profile = await db.get('SELECT * FROM farmers WHERE user_id = ?', [user.id]);
    } else if (user.role === 'labor') {
      profile = await db.get('SELECT * FROM labors WHERE user_id = ?', [user.id]);
    } else if (user.role === 'consumer') {
      profile = await db.get('SELECT * FROM consumers WHERE user_id = ?', [user.id]);
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error during login' });
  }
});


// ==========================================
// 2. FARMER ROUTES
// ==========================================

// Get Farmer profile
router.get('/farmer/profile/:userId', async (req, res) => {
  try {
    const profile = await db.get('SELECT * FROM farmers WHERE user_id = ?', [req.params.userId]);
    if (!profile) return res.status(404).json({ error: 'Farmer profile not found' });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Farmer profile
router.put('/farmer/profile/:userId', async (req, res) => {
  const { farm_name, farm_details, location, phone } = req.body;
  try {
    await db.run(
      'UPDATE farmers SET farm_name = ?, farm_details = ?, location = ?, phone = ? WHERE user_id = ?',
      [farm_name, farm_details, location, phone || '', req.params.userId]
    );
    const updated = await db.get('SELECT * FROM farmers WHERE user_id = ?', [req.params.userId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get farmer's own products
router.get('/farmer/products/:farmerId', async (req, res) => {
  try {
    const products = await db.all('SELECT * FROM products WHERE farmer_id = ?', [req.params.farmerId]);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/farmer/products', async (req, res) => {
  const { farmer_id, name, category, price, unit, description, image_url } = req.body;
  try {
    const result = await db.run(
      'INSERT INTO products (farmer_id, name, category, price, unit, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [farmer_id, name, category, price, unit, description, image_url || 'default']
    );
    const productId = result.id;

    // Log initial price in history
    await db.run('INSERT INTO price_history (product_id, price) VALUES (?, ?)', [productId, price]);

    const newProduct = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product (and record price changes if any)
router.put('/farmer/products/:id', async (req, res) => {
  const { name, category, price, unit, description, image_url } = req.body;
  const productId = req.params.id;

  try {
    const existing = await db.get('SELECT price FROM products WHERE id = ?', [productId]);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // Update product details
    await db.run(
      'UPDATE products SET name = ?, category = ?, price = ?, unit = ?, description = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, category, price, unit, description, image_url, productId]
    );

    // If price changed, record in history
    if (Number(existing.price) !== Number(price)) {
      await db.run('INSERT INTO price_history (product_id, price) VALUES (?, ?)', [productId, price]);
    }

    const updated = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/farmer/products/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price history for product
router.get('/farmer/products/:id/price-history', async (req, res) => {
  try {
    const history = await db.all(
      'SELECT price, change_date FROM price_history WHERE product_id = ? ORDER BY change_date ASC',
      [req.params.id]
    );
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get labor hire requests made by farmer
router.get('/farmer/hires/:farmerId', async (req, res) => {
  try {
    const query = `
      SELECT lh.*, l.name, l.phone, l.location, l.experience_years, l.payment_expectation, l.wage_type 
      FROM labor_hires lh
      JOIN labors l ON lh.labor_id = l.id
      WHERE lh.farmer_id = ?
      ORDER BY lh.hire_date DESC
    `;
    const hires = await db.all(query, [req.params.farmerId]);
    res.json(hires);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initiate labor hire request
router.post('/farmer/hire-labor', async (req, res) => {
  const { farmer_id, labor_id, remarks } = req.body;
  try {
    // Check if there is already a pending or active hire
    const existing = await db.get(
      'SELECT id FROM labor_hires WHERE farmer_id = ? AND labor_id = ? AND status IN (\'pending\', \'hired\')',
      [farmer_id, labor_id]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'A hiring request is already pending or active with this labor.' });
    }

    const result = await db.run(
      'INSERT INTO labor_hires (farmer_id, labor_id, status, remarks) VALUES (?, ?, \'pending\', ?)',
      [farmer_id, labor_id, remarks || '']
    );

    // Fetch details to send SMS Notification
    const labor = await db.get('SELECT user_id, name, phone FROM labors WHERE id = ?', [labor_id]);
    const farmer = await db.get('SELECT farm_name, phone FROM farmers WHERE id = ?', [farmer_id]);
    if (labor && farmer) {
      await sendNotification(
        labor.user_id,
        labor.phone,
        `[BioFarm] You have received a new hiring proposal from ${farmer.farm_name} (+91 ${farmer.phone || ''}): "${remarks}"`,
        'labor_hire'
      );
    }

    res.status(201).json({ id: result.id, message: 'Hiring request sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get consumer orders received by farmer
router.get('/farmer/orders/:farmerId', async (req, res) => {
  try {
    const orders = await db.all(
      `SELECT o.*, c.name as consumer_name, c.phone as consumer_phone, c.delivery_address 
       FROM orders o
       JOIN consumers c ON o.consumer_id = c.id
       WHERE o.farmer_id = ?
       ORDER BY o.order_date DESC`,
      [req.params.farmerId]
    );

    // Fetch items for each order
    for (let i = 0; i < orders.length; i++) {
      const items = await db.all(
        `SELECT oi.*, p.name as product_name, p.unit 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orders[i].id]
      );
      orders[i].items = items;
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status (with multi-stage tracking support)
router.put('/farmer/orders/:orderId', async (req, res) => {
  const { status } = req.body; // 'placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'
  const orderId = req.params.orderId;
  try {
    // Get order details before updating
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Update status. If completed or delivered, set payment_status to 'paid'
    const newPaymentStatus = (status === 'delivered' || status === 'completed') ? 'paid' : order.payment_status;
    await db.run('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [status, newPaymentStatus, orderId]);

    // Fetch profiles for notification
    const consumer = await db.get('SELECT user_id, name, phone FROM consumers WHERE id = ?', [order.consumer_id]);
    const farmer = await db.get('SELECT user_id, farm_name, phone FROM farmers WHERE id = ?', [order.farmer_id]);
    
    if (consumer && farmer) {
      let statusText = '';
      switch (status) {
        case 'confirmed':
          statusText = 'CONFIRMED 🤝. The farmer is preparing your order.';
          break;
        case 'processing':
          statusText = 'BEING PROCESSED 🚜. Fresh produce is being harvested and packaged.';
          break;
        case 'shipped':
          statusText = 'SHIPPED 🚚. In transit to your address.';
          break;
        case 'delivered':
        case 'completed':
          statusText = 'DELIVERED 🏁. Enjoy your fresh organic harvest!';
          break;
        case 'cancelled':
          statusText = 'CANCELLED ❌.';
          break;
        default:
          statusText = `updated to ${status.toUpperCase()}.`;
      }
      
      await sendNotification(
        consumer.user_id,
        order.alert_phone || consumer.phone || 'N/A',
        `[BioFarm] Order #200${orderId} with ${farmer.farm_name} has been ${statusText}`,
        'order_status'
      );

      if (status === 'confirmed') {
        await sendNotification(
          farmer.user_id,
          farmer.phone || 'N/A',
          `[BioFarm] You confirmed Order #200${orderId} from ${consumer.name || 'Customer'}. Total: ₹${order.total_price}. Please prepare it for delivery.`,
          'order_confirmed'
        );
      }
    }

    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 3. LABOR ROUTES
// ==========================================

// Get Labor profile
router.get('/labor/profile/:userId', async (req, res) => {
  try {
    const profile = await db.get('SELECT * FROM labors WHERE user_id = ?', [req.params.userId]);
    if (!profile) return res.status(404).json({ error: 'Labor profile not found' });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Labor profile
router.put('/labor/profile/:userId', async (req, res) => {
  const { name, phone, location, experience_years, payment_expectation, wage_type } = req.body;
  try {
    await db.run(
      `UPDATE labors 
       SET name = ?, phone = ?, location = ?, experience_years = ?, payment_expectation = ?, wage_type = ? 
       WHERE user_id = ?`,
      [name, phone, location, experience_years, payment_expectation, wage_type, req.params.userId]
    );
    const updated = await db.get('SELECT * FROM labors WHERE user_id = ?', [req.params.userId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get incoming hires/requests for Labor
router.get('/labor/hires/:laborId', async (req, res) => {
  try {
    const query = `
      SELECT lh.*, f.farm_name, f.location as farm_location, u.username as farmer_username
      FROM labor_hires lh
      JOIN farmers f ON lh.farmer_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE lh.labor_id = ?
      ORDER BY lh.hire_date DESC
    `;
    const hires = await db.all(query, [req.params.laborId]);
    res.json(hires);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update incoming hire status (accept/reject)
router.put('/labor/hires/:hireId', async (req, res) => {
  const { status } = req.body; // 'hired' or 'rejected'
  const hireId = req.params.hireId;
  try {
    const hire = await db.get('SELECT * FROM labor_hires WHERE id = ?', [hireId]);
    if (!hire) return res.status(404).json({ error: 'Hiring proposal not found' });

    await db.run('UPDATE labor_hires SET status = ? WHERE id = ?', [status, hireId]);

    // Send SMS Notification to Farmer
    const labor = await db.get('SELECT name, phone FROM labors WHERE id = ?', [hire.labor_id]);
    const farmer = await db.get('SELECT user_id, phone FROM farmers WHERE id = ?', [hire.farmer_id]);
    if (labor && farmer) {
      const decisionText = status === 'hired' ? 'ACCEPTED ✅' : 'DECLINED ❌';
      await sendNotification(
        farmer.user_id,
        farmer.phone || 'N/A',
        `[BioFarm] ${labor.name} (+91 ${labor.phone}) has ${decisionText} your job proposal.`,
        'hire_update'
      );
    }

    res.json({ message: `Hiring request ${status} successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 4. CONSUMER ROUTES
// ==========================================

// Get Consumer profile
router.get('/consumer/profile/:userId', async (req, res) => {
  try {
    const profile = await db.get('SELECT * FROM consumers WHERE user_id = ?', [req.params.userId]);
    if (!profile) return res.status(404).json({ error: 'Consumer profile not found' });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Consumer profile
router.put('/consumer/profile/:userId', async (req, res) => {
  const { name, phone, delivery_address } = req.body;
  try {
    await db.run(
      'UPDATE consumers SET name = ?, phone = ?, delivery_address = ? WHERE user_id = ?',
      [name, phone, delivery_address, req.params.userId]
    );
    const updated = await db.get('SELECT * FROM consumers WHERE user_id = ?', [req.params.userId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all farms (with their profile details)
router.get('/consumer/farms', async (req, res) => {
  try {
    const farms = await db.all('SELECT * FROM farmers ORDER BY farm_name ASC');
    res.json(farms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Browse products from all farms (with optional filters)
router.get('/consumer/products', async (req, res) => {
  const { category, search } = req.query;
  let query = `
    SELECT p.*, f.farm_name, f.location as farm_location, f.phone as farmer_phone 
    FROM products p
    JOIN farmers f ON p.farmer_id = f.id
  `;
  const params = [];

  const filters = [];
  if (category && category !== 'All') {
    filters.push('p.category = ?');
    params.push(category);
  }
  if (search) {
    filters.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.length > 0) {
    query += ' WHERE ' + filters.join(' AND ');
  }

  query += ' ORDER BY p.name ASC';

  try {
    const products = await db.all(query, params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get farm details + products by farmerId
router.get('/consumer/farms/:farmerId', async (req, res) => {
  try {
    const farm = await db.get('SELECT * FROM farmers WHERE id = ?', [req.params.farmerId]);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    
    const products = await db.all('SELECT * FROM products WHERE farmer_id = ?', [req.params.farmerId]);
    res.json({ farm, products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Post consumer order
router.post('/consumer/order', async (req, res) => {
  const { consumer_id, farmer_id, items, total_price, payment_method, phone } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const method = payment_method || 'cod';
  const payment_status = method === 'cod' ? 'pending' : 'paid';

  try {
    // 1. Insert order
    const orderResult = await db.run(
      'INSERT INTO orders (consumer_id, farmer_id, total_price, status, payment_method, payment_status, alert_phone) VALUES (?, ?, ?, \'pending\', ?, ?, ?)',
      [consumer_id, farmer_id, total_price, method, payment_status, phone || null]
    );
    const orderId = orderResult.id;

    // 2. Insert items
    for (const item of items) {
      await db.run(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.price]
      );
    }

    // 3. Send SMS notifications
    const consumer = await db.get('SELECT user_id, name, phone FROM consumers WHERE id = ?', [consumer_id]);
    const farmer = await db.get('SELECT user_id, farm_name, phone FROM farmers WHERE id = ?', [farmer_id]);
    
    if (consumer) {
      const pMethodLabel = method === 'cod' ? 'Cash on Delivery' : method.toUpperCase();
      const pStatusLabel = payment_status === 'paid' ? 'Paid' : 'Pending';
      const targetPhone = phone || consumer.phone || 'N/A';
      await sendNotification(
        consumer.user_id,
        targetPhone,
        `[BioFarm] Order #200${orderId} placed successfully with ${farmer?.farm_name || 'the farm'}. Payment: ${pMethodLabel} (${pStatusLabel}). Total: ₹${total_price}.`,
        'order_status'
      );
    }
    
    if (farmer) {
      const pMethodLabel = method === 'cod' ? 'Cash on Delivery' : method.toUpperCase();
      await sendNotification(
        farmer.user_id,
        farmer.phone || 'N/A',
        `[BioFarm] New Order #200${orderId} received from ${consumer?.name || 'Customer'} (+91 ${consumer?.phone || ''}). Payment: ${pMethodLabel}. Total: ₹${total_price}.`,
        'new_order'
      );
    }

    res.status(201).json({ id: orderId, message: 'Order placed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get consumer order history
router.get('/consumer/orders/:consumerId', async (req, res) => {
  try {
    const orders = await db.all(
      `SELECT o.*, f.farm_name, f.location as farm_location, f.phone as farmer_phone 
       FROM orders o
       JOIN farmers f ON o.farmer_id = f.id
       WHERE o.consumer_id = ?
       ORDER BY o.order_date DESC`,
      [req.params.consumerId]
    );

    for (let i = 0; i < orders.length; i++) {
      const items = await db.all(
        `SELECT oi.*, p.name as product_name, p.unit 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orders[i].id]
      );
      orders[i].items = items;
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete payment for a pending order
router.put('/consumer/order/:orderId/pay', async (req, res) => {
  const { payment_method } = req.body;
  const { orderId } = req.params;

  if (!payment_method || !['upi', 'card'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  try {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    await db.run(
      "UPDATE orders SET payment_status = 'paid', payment_method = ? WHERE id = ?",
      [payment_method, orderId]
    );

    // Fetch profiles for notification
    const consumer = await db.get('SELECT user_id, phone FROM consumers WHERE id = ?', [order.consumer_id]);
    const farmer = await db.get('SELECT user_id, farm_name, phone FROM farmers WHERE id = ?', [order.farmer_id]);

    if (consumer) {
      await sendNotification(
        consumer.user_id,
        order.alert_phone || consumer.phone || 'N/A',
        `[BioFarm] Payment of ₹${order.total_price} for Order #200${orderId} was successfully processed via ${payment_method.toUpperCase()}. Thank you!`,
        'payment_received'
      );
    }

    if (farmer) {
      await sendNotification(
        farmer.user_id,
        farmer.phone || 'N/A',
        `[BioFarm] Order #200${orderId} has been paid via ${payment_method.toUpperCase()}. Total amount received: ₹${order.total_price}.`,
        'payment_received'
      );
    }

    res.json({ message: 'Order paid successfully', payment_status: 'paid', payment_method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simulate sending SMS notifications for payment (OTP or UPI request)
router.post('/payment/simulate-notification', async (req, res) => {
  const { userId, phone, message, type } = req.body;

  if (!userId || !phone || !message) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    await sendNotification(userId, phone, message, type || 'payment_simulation');
    res.status(201).json({ message: 'Simulation notification queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 5. GLOBAL LABORS SEARCH (FOR FARMERS)
// ==========================================
router.get('/search/labors', async (req, res) => {
  const { location, max_wage, wage_type, min_experience } = req.query;
  
  let query = 'SELECT * FROM labors';
  const params = [];
  const filters = [];

  if (location && location.trim() !== '') {
    filters.push('location LIKE ?');
    params.push(`%${location.trim()}%`);
  }

  if (max_wage) {
    filters.push('payment_expectation <= ?');
    params.push(Number(max_wage));
  }

  if (wage_type) {
    filters.push('wage_type = ?');
    params.push(wage_type);
  }

  if (min_experience) {
    filters.push('experience_years >= ?');
    params.push(Number(min_experience));
  }

  if (filters.length > 0) {
    query += ' WHERE ' + filters.join(' AND ');
  }

  query += ' ORDER BY experience_years DESC';

  try {
    const labors = await db.all(query, params);
    res.json(labors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. NOTIFICATION ROUTES
// ==========================================

// Get recent notifications for user
router.get('/notifications/:userId', async (req, res) => {
  try {
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all user notifications as read
router.put('/notifications/read/:userId', async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.params.userId]);
    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. FCM TOKEN MANAGEMENT ROUTES
// ==========================================

// Save FCM token for a user (called after frontend gets FCM token)
router.post('/fcm/token', async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ error: 'userId and token are required' });
  }

  try {
    await fcm.registerToken(db, userId, token);
    res.status(201).json({ message: 'FCM token saved successfully' });
  } catch (error) {
    console.error('[FCM] Error saving token:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove FCM token (called on logout)
router.delete('/fcm/token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  try {
    await fcm.removeToken(db, token);
    res.json({ message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('[FCM] Error removing token:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get FCM status (for frontend to check if FCM is configured on backend)
router.get('/fcm/status', (req, res) => {
  res.json({
    enabled: fcm.isInitialized(),
    vapidConfigured: !!fcm.getVapidKey(),
    message: fcm.isInitialized()
      ? 'FCM is active and ready to send push notifications'
      : 'FCM is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH to enable.'
  });
});

// ==========================================
// 8. ADMIN TEST NOTIFICATION ROUTE
// ==========================================

// Send a test FCM push notification to a specific user (admin use)
router.post('/fcm/send-test', async (req, res) => {
  const { userId, title, body } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const count = await fcm.sendTestNotification(
      db,
      userId,
      title || 'BioFarm Test 🌾',
      body || 'Firebase push notifications are working correctly!'
    );

    res.json({
      message: `Test notification sent to ${count} device(s).`,
      devicesReached: count
    });
  } catch (error) {
    console.error('[FCM] Error sending test notification:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Send FCM push to any user (admin use — include auth middleware in production)
router.post('/fcm/send', async (req, res) => {
  const { userId, title, body, data } = req.body;

  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'userId, title, and body are required' });
  }

  try {
    const count = await fcm.sendFCMToUser(db, userId, title, body, data || {});
    res.json({
      message: `Notification sent to ${count} device(s).`,
      devicesReached: count
    });
  } catch (error) {
    console.error('[FCM] Error sending notification:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
