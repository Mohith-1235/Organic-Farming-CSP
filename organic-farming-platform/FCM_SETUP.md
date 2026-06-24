# Firebase Cloud Messaging (FCM) Setup Guide

This guide explains how to fully enable push notifications in the BioFarm Organic Farming Platform.

---

## What Is Already Done ✅

| Item | Status |
|------|--------|
| Firebase Admin SDK installed (`firebase-admin`) | ✅ |
| Firebase Client SDK installed (`firebase`) | ✅ |
| `dotenv` installed in backend | ✅ |
| VAPID key configured in `.env` files | ✅ |
| `fcm.js` backend module (send, register, remove tokens) | ✅ |
| FCM token API routes (`POST/DELETE /api/fcm/token`) | ✅ |
| Admin send routes (`POST /api/fcm/send`, `/api/fcm/send-test`) | ✅ |
| Config endpoint (`GET /api/config`) exposing VAPID key | ✅ |
| `fcm_tokens` database table | ✅ |
| Frontend Firebase messaging module (`src/firebase.js`) | ✅ |
| Service Worker (`public/firebase-messaging-sw.js`) | ✅ |
| App-level FCM token registration & foreground messaging (App.jsx) | ✅ |

---

## What You Need To Do 🔧

### Step 1 — Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and follow the wizard.
3. Enable **Cloud Messaging** (it is enabled by default for new projects).

---

### Step 2 — Get Your Service Account (Backend)

1. In the Firebase Console, go to **Project Settings** (gear icon) → **Service accounts**.
2. Click **Generate new private key** → **Generate key**.
3. Save the downloaded JSON file as:
   ```
   backend/firebase-service-account.json
   ```
4. Your `backend/.env` already has:
   ```dotenv
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```
   So no further changes needed in `.env`.

> ⚠️ **Never commit `firebase-service-account.json` to version control.**  
> Add it to `.gitignore` if needed.

---

### Step 3 — Get Your Firebase Web App Config (Frontend)

1. In Firebase Console, go to **Project Settings** → **General** → scroll to **Your apps**.
2. Click **Add app** → choose **Web** (`</>`).
3. Register the app and copy the config object, e.g.:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
4. Fill in `frontend/.env`:
   ```dotenv
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   VITE_FIREBASE_VAPID_KEY=BNMXkbdjdU9dTymIpb3CDWgIyzVwg8Jf-d7HCAepeg7sb6mLFLagax2JaDxFE2Z_9zZosomAky3P39vDGsNWcq4
   ```
   > The VAPID key is already filled in for you.

---

### Step 4 — Update the Service Worker Config

Open `frontend/public/firebase-messaging-sw.js` and fill in the **same config values** from Step 3 directly into the file (since service workers cannot read Vite env vars):

```js
// Replace the placeholder values:
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

> The service worker reads values from `self.__FIREBASE_CONFIG__` which is injected via the existing SW code — just make sure the values are correct.

---

### Step 5 — Start the Servers

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Returns VAPID key and FCM enabled status |
| `GET` | `/api/fcm/status` | FCM backend status |
| `POST` | `/api/fcm/token` | Register a device token `{ userId, token }` |
| `DELETE` | `/api/fcm/token` | Remove a device token `{ token }` |
| `POST` | `/api/fcm/send` | Send push to user `{ userId, title, body, data? }` |
| `POST` | `/api/fcm/send-test` | Send test push to user `{ userId, title?, body? }` |

---

## Testing FCM

1. Start both servers.
2. Log in to BioFarm as any user.
3. Click the 🔔 bell icon in the navbar.
4. Click **"Enable Firebase Push"** and grant browser permission.
5. Use curl or Postman to test:
   ```bash
   curl -X POST http://localhost:5000/api/fcm/send-test \
     -H "Content-Type: application/json" \
     -d '{"userId": 1}'
   ```
6. You should see a push notification appear in the browser.

---

## How It Works (Flow)

```
User grants permission
        ↓
firebase.js calls getToken(messaging, { vapidKey })
        ↓
FCM token sent to POST /api/fcm/token
        ↓
Token stored in fcm_tokens table (SQLite)
        ↓
On any event (order placed, hire request etc.)
        ↓
sendFCMToUser() fetches all tokens for that user
        ↓
admin.messaging().send() sends push via Google FCM servers
        ↓
Browser/SW receives push → shows notification
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `[FCM] No Firebase credentials configured` | Place `firebase-service-account.json` in backend folder and verify path in `.env` |
| `[FCM] Service account file not found` | Check the path `FIREBASE_SERVICE_ACCOUNT_PATH` in `backend/.env` |
| No token obtained in browser | Check that `VITE_FIREBASE_*` env vars are filled in `frontend/.env` |
| Background notifications not showing | Ensure SW config in `firebase-messaging-sw.js` matches `frontend/.env` values |
| Browser shows "Permission denied" | Reset notification permission in browser site settings |
