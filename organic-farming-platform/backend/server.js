// Load environment variables from .env file first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./routes');
const fcm = require('./fcm');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Parse JSON payloads
app.use(express.json());

// Mount API routes
app.use('/api', apiRouter);

// ──────────────────────────────────────────────────
// Public config endpoint — exposes safe client-side
// Firebase configuration values (VAPID key etc.)
// ──────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    vapidKey: fcm.getVapidKey(),
    fcmEnabled: fcm.isInitialized()
  });
});

// Basic health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Organic Farming Platform API is healthy.',
    fcmEnabled: fcm.isInitialized()
  });
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Organic Farming API server is running in development mode. API endpoints are under /api.');
  });
}

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Backend API Server running on port ${PORT}`);
  console.log(`Database connected & initialized`);
  console.log(`FCM Status: ${fcm.isInitialized() ? '✅ Enabled' : '⚠️  Disabled (add service account to .env)'}`);
  console.log(`========================================`);
});
