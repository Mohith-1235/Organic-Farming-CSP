import { useState, useEffect, useCallback, useRef } from 'react';
import AuthPage from './pages/AuthPage';
import FarmerDashboard from './pages/FarmerDashboard';
import LaborDashboard from './pages/LaborDashboard';
import ConsumerDashboard from './pages/ConsumerDashboard';
import { requestFCMToken, onFCMMessage, isFCMAvailable } from './firebase';

const readStoredJson = (key) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error(`Unable to read saved ${key}:`, err);
    localStorage.removeItem(key);
    return null;
  }
};

function App() {
  const [user, setUser] = useState(() => readStoredJson('user'));
  const [profile, setProfile] = useState(() => readStoredJson('profile'));
  
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [smsPopup, setSmsPopup] = useState(null);
  const seenNotificationIdsRef = useRef(new Set());
  const fcmTokenRef = useRef(null);
  const fcmAvailable = isFCMAvailable();

  // Track browser native notification permission
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Track if FCM push is actively registered
  const [fcmRegistered, setFcmRegistered] = useState(false);

  // Request push notification permission (FCM-first, fallback to native)
  const requestBrowserNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return;
    }

    try {
      // If Firebase FCM is available, use it (it handles permission internally)
      if (fcmAvailable && user?.id) {
        const token = await requestFCMToken();
        if (token) {
          fcmTokenRef.current = token;
          setFcmRegistered(true);
          // Save token to backend
          await fetch('/api/fcm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, token })
          });
          setBrowserNotificationPermission('granted');
          console.log('[App] FCM token registered successfully');
          return;
        }
      }

      // Fallback: native Notification API
      const permission = await Notification.requestPermission();
      setBrowserNotificationPermission(permission);
    } catch (err) {
      console.error('Error requesting notification permission:', err);
    }
  };

  // Register FCM token when user logs in
  useEffect(() => {
    if (!user?.id) return;

    const registerFCM = async () => {
      if (!fcmAvailable) return;

      // Only auto-register if permission was previously granted
      if (Notification.permission === 'granted') {
        try {
          const token = await requestFCMToken();
          if (token) {
            fcmTokenRef.current = token;
            setFcmRegistered(true);
            await fetch('/api/fcm/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id, token })
            });
            console.log('[App] FCM auto-registered on login');
          }
        } catch (err) {
          console.error('[App] FCM auto-register failed:', err);
        }
      }
    };

    registerFCM();
  }, [user?.id, fcmAvailable]);

  // Listen for foreground FCM messages
  useEffect(() => {
    if (!fcmAvailable) return;

    const unsubscribe = onFCMMessage(({ title, body, data }) => {
      console.log('[App] FCM foreground message:', title, body);

      // Show as SMS-style toast popup
      const fcmNotif = {
        id: 'fcm-' + Date.now(),
        message: body,
        phone: 'FCM Push',
        created_at: new Date().toISOString(),
        type: data?.type || 'fcm',
        is_read: 0
      };

      setSmsPopup(fcmNotif);
      setTimeout(() => {
        setSmsPopup(prev => prev?.id === fcmNotif.id ? null : prev);
      }, 6000);

      // Also show native notification
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, { body, icon: '/favicon.svg' });
        } catch (err) {
          console.error('Native notification error:', err);
        }
      }

      // Refresh notifications from server
      if (user?.id) {
        fetchNotifications(user.id);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fcmAvailable, user?.id]);

  // Trigger a test native notification
  const sendTestNotification = () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('BioFarm Notification 🌾', {
          body: fcmRegistered
            ? 'Firebase Push Notifications are active! You will receive real-time alerts even in background tabs.'
            : 'Desktop notifications are active. You will receive updates here!',
          icon: '/favicon.svg'
        });
      } catch (err) {
        console.error('Failed to trigger native notification:', err);
      }
    }
  };

  // Fetch notifications
  const fetchNotifications = useCallback(async (userId) => {
    try {
      const res = await fetch(`/api/notifications/${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      
      setNotifications(data);

      // Check if we have new notifications to alert via SMS & browser notifications
      const previousIds = seenNotificationIdsRef.current;
      if (previousIds.size > 0) {
        const newNotifs = data.filter(n => !previousIds.has(n.id));
        if (newNotifs.length > 0) {
          const latest = newNotifs[0]; // Ordered DESC by database
          setSmsPopup(latest);

          // Trigger browser native notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('BioFarm Alert 🌾', {
                body: latest.message,
                icon: '/favicon.svg'
              });
            } catch (err) {
              console.error('Failed to trigger native notification:', err);
            }
          }
          
          // Auto hide SMS popup after 6 seconds
          setTimeout(() => {
            setSmsPopup(prev => prev?.id === latest.id ? null : prev);
          }, 6000);
        }
      }

      seenNotificationIdsRef.current = new Set(data.map(n => n.id));
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, []);

  // Poll notifications when user is logged in
  useEffect(() => {
    if (user?.id) {
      const initialFetchId = setTimeout(() => {
        fetchNotifications(user.id);
      }, 0);

      const interval = setInterval(() => {
        fetchNotifications(user.id);
      }, 4000); // poll every 4 seconds

      return () => {
        clearTimeout(initialFetchId);
        clearInterval(interval);
      };
    }
  }, [fetchNotifications, user?.id]);

  const markNotificationsRead = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/notifications/read/${user.id}`, {
        method: 'PUT'
      });
      if (res.ok) {
        setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const login = (userData, profileData) => {
    setUser(userData);
    setProfile(profileData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('profile', JSON.stringify(profileData));
  };

  const logout = async () => {
    // Remove FCM token from backend on logout
    if (fcmTokenRef.current) {
      try {
        await fetch('/api/fcm/token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fcmTokenRef.current })
        });
        console.log('[App] FCM token removed on logout');
      } catch (err) {
        console.error('[App] Error removing FCM token:', err);
      }
      fcmTokenRef.current = null;
      setFcmRegistered(false);
    }

    setUser(null);
    setProfile(null);
    setNotifications([]);
    setShowNotifications(false);
    seenNotificationIdsRef.current = new Set();
    setSmsPopup(null);
    localStorage.removeItem('user');
    localStorage.removeItem('profile');
  };

  const updateProfileState = (updatedProfile) => {
    setProfile(updatedProfile);
    localStorage.setItem('profile', JSON.stringify(updatedProfile));
  };

  // If user is not logged in, show authentication portal
  if (!user) {
    return <AuthPage onLogin={login} />;
  }

  return (
    <div className="app-container">
      {/* Premium Navbar */}
      <nav className="navbar">
        <div className="container navbar-container">
          <div className="navbar-logo">
            🌾 BioFarm<span className="accent-dot">.</span>
          </div>
          <div className="navbar-links">
            {/* Notification Bell Dropdown */}
            <div className="bell-wrapper">
              <button className="bell-btn" onClick={() => setShowNotifications(!showNotifications)}>
                🔔
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="bell-badge">
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div className="notifications-dropdown">
                  <div className="notifications-header">
                    <h4>Recent Alerts</h4>
                    <button className="mark-read-btn" onClick={markNotificationsRead}>
                      Mark all read
                    </button>
                  </div>

                  <div className="browser-push-settings">
                    <div className="push-settings-icon-wrapper">
                      <span className={`push-icon ${browserNotificationPermission === 'granted' ? 'active' : ''}`}>
                        {fcmRegistered ? '🔥' : '🔔'}
                      </span>
                    </div>
                    <div className="push-settings-content">
                      <div className="push-settings-row">
                        <span className="push-settings-label">
                          {fcmRegistered ? 'Firebase Push' : 'Desktop Alerts'}
                        </span>
                        <span className={`push-status-pill ${browserNotificationPermission}`}>
                          {browserNotificationPermission === 'granted' && (fcmRegistered ? '🔥 FCM Active' : 'Enabled')}
                          {browserNotificationPermission === 'default' && 'Disabled'}
                          {browserNotificationPermission === 'denied' && 'Blocked'}
                          {browserNotificationPermission === 'unsupported' && 'Unsupported'}
                        </span>
                      </div>
                      <p className="push-settings-desc">
                        {browserNotificationPermission === 'granted' && fcmRegistered && 'Firebase Cloud Messaging active — real-time push even in background tabs!'}
                        {browserNotificationPermission === 'granted' && !fcmRegistered && 'Receive real-time notifications on your desktop.'}
                        {browserNotificationPermission === 'default' && (fcmAvailable
                          ? 'Enable Firebase push notifications for instant real-time alerts.'
                          : 'Enable alerts to get instant notifications when you are in other tabs.')}
                        {browserNotificationPermission === 'denied' && 'Notifications are blocked. Please enable them in site settings.'}
                        {browserNotificationPermission === 'unsupported' && 'Your browser does not support push notifications.'}
                      </p>
                      
                      {browserNotificationPermission === 'default' && (
                        <button className="btn btn-sm btn-primary push-enable-btn" onClick={requestBrowserNotificationPermission}>
                          {fcmAvailable ? '🔥 Enable Firebase Push' : 'Enable Desktop Alerts'}
                        </button>
                      )}
                      {browserNotificationPermission === 'granted' && (
                        <button className="btn btn-sm btn-outline push-test-btn" onClick={sendTestNotification}>
                          Send Test Notification
                        </button>
                      )}
                      {browserNotificationPermission === 'denied' && (
                        <div className="push-unblock-instruction">
                          ⚙️ Open browser settings to reset permission
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="notifications-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`notification-item-card ${!n.is_read ? 'unread' : ''}`}>
                          <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>{n.message}</div>
                          <div className="notification-item-meta">
                            <span>📱 Phone: {n.phone}</span>
                            <span>{new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="nav-user">
              <span className="user-badge">{user.role}</span>
              <span style={{ fontWeight: 600, color: '#1e4d2b' }}>
                {user.role === 'farmer' && (profile?.farm_name || user.username)}
                {user.role === 'labor' && (profile?.name || user.username)}
                {user.role === 'consumer' && (profile?.name || user.username)}
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Render role-based dashboards */}
      <main className="fade-in">
        {user.role === 'farmer' && (
          <FarmerDashboard user={user} profile={profile} onProfileUpdate={updateProfileState} />
        )}
        {user.role === 'labor' && (
          <LaborDashboard user={user} profile={profile} onProfileUpdate={updateProfileState} />
        )}
        {user.role === 'consumer' && (
          <ConsumerDashboard user={user} profile={profile} onProfileUpdate={updateProfileState} />
        )}
      </main>

      {/* Simulated Smartphone SMS Toast */}
      {smsPopup && (
        <div className="sms-phone-toast">
          <div className="phone-notch"></div>
          <div className="phone-screen">
            <div className="phone-status-bar">
              <span>{new Date(smsPopup.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              <span>📶 🔋 98%</span>
            </div>
            <div className="sms-banner">
              <div className="sms-banner-header">
                <span className="sms-app-title">💬 MESSAGES</span>
                <button className="sms-phone-close" onClick={() => setSmsPopup(null)}>✕</button>
              </div>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#1a1a1a', marginBottom: '4px' }}>
                BioFarm SMS Alert
              </div>
              <div className="sms-body" style={{ color: '#333333' }}>
                {smsPopup.message}
              </div>
            </div>
            <div className="phone-home-indicator"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
