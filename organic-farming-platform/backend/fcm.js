/**
 * Firebase Cloud Messaging (FCM) Backend Module
 *
 * Initializes firebase-admin and exports helper functions
 * for sending push notifications via FCM.
 *
 * Gracefully degrades if Firebase credentials are not configured.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let fcmInitialized = false;

// Try to initialize Firebase Admin SDK
function initializeFirebase() {
  if (fcmInitialized) return true;

  try {
    // Option 1: Service account JSON file path via env var
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    // Option 2: Service account JSON string via env var
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    let credential;

    if (serviceAccountPath) {
      const resolvedPath = path.resolve(serviceAccountPath);
      if (fs.existsSync(resolvedPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
        credential = admin.credential.cert(serviceAccount);
        console.log('[FCM] Initialized with service account file:', resolvedPath);
      } else {
        console.warn('[FCM] Service account file not found at:', resolvedPath);
        return false;
      }
    } else if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      credential = admin.credential.cert(serviceAccount);
      console.log('[FCM] Initialized with service account from environment variable.');
    } else {
      console.warn('[FCM] No Firebase credentials configured. Push notifications disabled.');
      console.warn('[FCM] Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON to enable.');
      return false;
    }

    admin.initializeApp({ credential });
    fcmInitialized = true;
    console.log('[FCM] ✅ Firebase Admin SDK initialized successfully.');
    return true;
  } catch (err) {
    console.error('[FCM] ❌ Failed to initialize Firebase Admin SDK:', err.message);
    return false;
  }
}

// Initialize on module load
initializeFirebase();

/**
 * Register (upsert) an FCM token for a user.
 *
 * @param {object} dbModule - The database module (with .run() method)
 * @param {number} userId - User ID
 * @param {string} token - FCM device token
 * @returns {Promise<void>}
 */
async function registerToken(dbModule, userId, token) {
  // Delete any existing record for this token (could belong to old user)
  await dbModule.run('DELETE FROM fcm_tokens WHERE token = ?', [token]);
  // Insert fresh record
  await dbModule.run(
    'INSERT INTO fcm_tokens (user_id, token) VALUES (?, ?)',
    [userId, token]
  );
  console.log(`[FCM] ✅ Token registered for user ${userId}: ${token.substring(0, 20)}...`);
}

/**
 * Remove an FCM token (called on logout).
 *
 * @param {object} dbModule - The database module (with .run() method)
 * @param {string} token - FCM device token to remove
 * @returns {Promise<void>}
 */
async function removeToken(dbModule, token) {
  await dbModule.run('DELETE FROM fcm_tokens WHERE token = ?', [token]);
  console.log(`[FCM] 🗑️ Token removed: ${token.substring(0, 20)}...`);
}

/**
 * Send a push notification via FCM to a specific device token.
 *
 * @param {string} token - The FCM device registration token
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload (key-value string pairs)
 * @returns {Promise<string|null>} - Message ID if sent, null if skipped
 */
async function sendFCMNotification(token, title, body, data = {}) {
  if (!fcmInitialized) {
    console.log('[FCM] Skipping push (not initialized):', title);
    return null;
  }

  if (!token || token.trim() === '') {
    console.log('[FCM] Skipping push (no token):', title);
    return null;
  }

  try {
    const message = {
      token,
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: data.click_action || '/',
        timestamp: new Date().toISOString()
      },
      webpush: {
        notification: {
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          actions: [
            {
              action: 'open',
              title: 'Open BioFarm'
            }
          ]
        },
        fcmOptions: {
          link: '/'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`[FCM] ✅ Push sent successfully. Message ID: ${response}`);
    return response;
  } catch (err) {
    // Handle invalid/expired tokens gracefully
    if (
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/registration-token-not-registered'
    ) {
      console.warn(`[FCM] ⚠️ Invalid/expired token: ${token.substring(0, 20)}...`);
      return null;
    }
    console.error('[FCM] ❌ Error sending push notification:', err.message);
    return null;
  }
}

/**
 * Send push notification to ALL tokens registered for a user.
 *
 * @param {object} dbModule - The database module (with .all() method)
 * @param {number} userId - User ID to look up tokens for
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload
 * @returns {Promise<number>} - Number of notifications successfully sent
 */
async function sendFCMToUser(dbModule, userId, title, body, data = {}) {
  if (!fcmInitialized) return 0;

  try {
    const tokens = await dbModule.all(
      'SELECT token FROM fcm_tokens WHERE user_id = ?',
      [userId]
    );

    if (!tokens || tokens.length === 0) {
      console.log(`[FCM] No registered tokens for user ${userId}`);
      return 0;
    }

    let successCount = 0;
    const tokensToRemove = [];

    for (const { token } of tokens) {
      const result = await sendFCMNotification(token, title, body, data);
      if (result) {
        successCount++;
      } else if (result === null && fcmInitialized) {
        // Token might be invalid — mark for cleanup
        tokensToRemove.push(token);
      }
    }

    // Clean up invalid tokens
    for (const token of tokensToRemove) {
      try {
        await dbModule.run('DELETE FROM fcm_tokens WHERE token = ?', [token]);
        console.log(`[FCM] 🗑️ Removed invalid token for user ${userId}`);
      } catch (cleanupErr) {
        console.error('[FCM] Error cleaning up token:', cleanupErr.message);
      }
    }

    console.log(`[FCM] Sent to ${successCount}/${tokens.length} devices for user ${userId}`);
    return successCount;
  } catch (err) {
    console.error(`[FCM] Error sending to user ${userId}:`, err.message);
    return 0;
  }
}

/**
 * Send a test notification to a specific user (admin use only).
 *
 * @param {object} dbModule - The database module
 * @param {number} userId - Target user ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Promise<number>} - Number of devices notified
 */
async function sendTestNotification(dbModule, userId, title = 'BioFarm Test 🌾', body = 'Firebase push notifications are working!') {
  return sendFCMToUser(dbModule, userId, title, body, { type: 'test' });
}

module.exports = {
  sendFCMNotification,
  sendFCMToUser,
  registerToken,
  removeToken,
  sendTestNotification,
  isInitialized: () => fcmInitialized,
  getVapidKey: () => process.env.VAPID_KEY || null
};
