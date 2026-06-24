import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

function PaymentGatewayModal({ isOpen, onClose, totalPrice, orderId, user, profile, farmerPhone, onSuccess }) {
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi', 'card'
  const [upiMode, setUpiMode] = useState('qr'); // 'qr', 'upi_id'
  const [selectedUpiApp, setSelectedUpiApp] = useState('gpay'); // 'gpay', 'phonepe', 'paytm', 'bhim'
  
  // Card Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isFlipped, setIsFlipped] = useState(false);

  // UPI ID Form State (kept for potential future use)
  const [upiId, setUpiId] = useState('');
  const [upiRequestSent, setUpiRequestSent] = useState(false);
  const [qrImageFailed, setQrImageFailed] = useState(false);

  // UPI PIN State
  const [upiPin, setUpiPin] = useState('');
  const [upiPinError, setUpiPinError] = useState('');

  // Status/Flow States
  const [gatewayState, setGatewayState] = useState('input'); // 'input', 'processing', 'otp', 'upi_pin', 'success', 'failed'
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  // Timers
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins for UPI QR
  const [otpTimeLeft, setOtpTimeLeft] = useState(120); // 2 mins for OTP

  const timeoutIds = useRef([]);

  const delay = (fn, ms) => {
    const id = setTimeout(() => {
      timeoutIds.current = timeoutIds.current.filter(item => item !== id);
      fn();
    }, ms);
    timeoutIds.current.push(id);
    return id;
  };

  useEffect(() => {
    return () => {
      // Clear all scheduled timeouts on unmount to prevent state updates/success callback after close
      timeoutIds.current.forEach(clearTimeout);
    };
  }, []);

  // Ensure totalPrice is a valid number
  const safeTotalPrice = Number(totalPrice) || 0;

  // Start UPI countdown timer when QR mode is active
  useEffect(() => {
    if (!isOpen) return;
    if (gatewayState === 'input' && paymentMethod === 'upi') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setGatewayState('failed');
            setStatusMessage('Transaction session timed out.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isOpen, paymentMethod, gatewayState]);

  // Start OTP timer when OTP state is active
  useEffect(() => {
    if (gatewayState === 'otp') {
      const timer = setInterval(() => {
        setOtpTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setOtpError('OTP has expired. Please request a new one.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gatewayState]);

  if (!isOpen) return null;

  // Format Card Number (adds space every 4 digits)
  const handleCardNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').substring(0, 16);
    const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
  };

  // Format Expiry Date (MM/YY)
  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 3) {
      val = val.substring(0, 2) + '/' + val.substring(2);
    }
    setCardExpiry(val);
  };

  // Format CVV (max 3 digits)
  const handleCvvChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').substring(0, 3);
    setCardCvv(val);
  };

  // Detect Card Brand Logo
  const getCardBrand = () => {
    const cleanNum = cardNumber.replace(/\s/g, '');
    if (cleanNum.startsWith('4')) return 'Visa';
    if (cleanNum.startsWith('5')) return 'Mastercard';
    if (cleanNum.startsWith('6')) return 'RuPay';
    return 'Card';
  };

  // Helper to send notifications using our simulated backend API
  const sendSimulatedSms = async (message, type) => {
    try {
      await fetch('/api/payment/simulate-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          phone: profile?.phone || 'N/A',
          message,
          type
        })
      });
    } catch (err) {
      console.error('Failed to trigger simulated notification:', err);
    }
  };

  // Handle Send UPI ID Request
  const handleSendUpiRequest = async (e) => {
    e.preventDefault();
    if (!upiId.trim() || !upiId.includes('@')) {
      alert('Please enter a valid UPI ID (e.g. user@okaxis)');
      return;
    }

    setGatewayState('processing');
    setStatusMessage(`Sending request to ${upiId}...`);

    delay(async () => {
      setUpiRequestSent(true);
      setGatewayState('input'); // Back to input for user to click Verify Payment
      
      const appNames = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM UPI' };
      const selectedAppName = appNames[selectedUpiApp];

      // Send payment request SMS toast
      await sendSimulatedSms(
        `[${selectedAppName}] UPI Collect request received from BioFarm to pay ₹${safeTotalPrice}. Open your app to authorize payment.`,
        'upi_request'
      );
    }, 1500);
  };

  // Clean the farmer's phone number to form a dynamic UPI ID (e.g. 9900011223@upi)
  const getFarmerUpiId = () => {
    if (!farmerPhone) return 'merchant.biofarm@paytm'; // default fallback
    const clean = farmerPhone.replace(/\D/g, ''); // keep only digits
    // If it has country code (e.g., 919900011223), take the last 10 digits
    const tenDigits = clean.length >= 10 ? clean.slice(-10) : clean;
    return tenDigits.length === 10 ? `${tenDigits}@upi` : 'merchant.biofarm@paytm';
  };

  const farmerUpiId = getFarmerUpiId();

  // Generate UPI URI
  const upiUrl = `upi://pay?pa=${farmerUpiId}&pn=BioFarmStore&am=${safeTotalPrice.toFixed(2)}&cu=INR&tn=BioFarm%20Order%20Ref%20${orderId || 'New'}`;
  
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  useEffect(() => {
    if (!upiUrl) return;
    QRCode.toDataURL(upiUrl, { width: 256, margin: 2 })
      .then(url => {
        setQrCodeDataUrl(url);
        setQrImageFailed(false);
      })
      .catch(err => {
        console.error('Failed to generate QR code locally:', err);
        setQrImageFailed(true);
      });
  }, [upiUrl]);

  // App buttons only choose the preferred UPI app. The QR stays visible until the user explicitly continues.
  const selectUpiApp = (app) => {
    setSelectedUpiApp(app);
    setUpiMode('qr');
    setUpiRequestSent(false);
    setQrImageFailed(false);
  };

  const openSelectedUpiApp = () => {
    setUpiPin('');
    setUpiPinError('');
    setGatewayState('upi_pin');
  };

  // Keypad click handler for UPI PIN
  const handleKeypadPress = (val) => {
    setUpiPinError('');
    if (val === 'back') {
      setUpiPin((prev) => prev.slice(0, -1));
    } else if (val === 'clear') {
      setUpiPin('');
    } else {
      if (upiPin.length < 6) {
        setUpiPin((prev) => prev + val);
      }
    }
  };

  // Verify UPI PIN & complete checkout
  const handleUpiPinSubmit = (e) => {
    if (e) e.preventDefault();
    if (upiPin.length < 4) {
      setUpiPinError('PIN must be 4 or 6 digits');
      return;
    }

    setGatewayState('processing');
    const appNames = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM UPI' };
    setStatusMessage(`Verifying UPI transaction with ${appNames[selectedUpiApp]} secure servers...`);

    delay(async () => {
      // Simulate success
      setGatewayState('success');
      
      // Notify payment received
      await sendSimulatedSms(
        `[BioFarm Pay] Transaction of ₹${safeTotalPrice} successful using ${appNames[selectedUpiApp]}.`,
        'payment_success'
      );

      delay(() => {
        onSuccess('upi');
      }, 2000);
    }, 2000);
  };

  // Verify payment scan
  const handleVerifyUpiPayment = () => {
    setGatewayState('processing');
    setStatusMessage('Connecting to UPI Network & verifying status...');

    delay(() => {
      setGatewayState('success');
      delay(() => {
        onSuccess(paymentMethod);
      }, 2000);
    }, 2500);
  };

  // Trigger Card payment verification and send simulated OTP
  const handleCardSubmit = (e) => {
    e.preventDefault();
    if (cardNumber.replace(/\s/g, '').length < 16) {
      alert('Please enter a valid 16-digit card number.');
      return;
    }
    if (cardExpiry.length < 5) {
      alert('Please enter a valid expiry date (MM/YY).');
      return;
    }
    if (cardCvv.length < 3) {
      alert('Please enter a valid 3-digit CVV.');
      return;
    }

    setGatewayState('processing');
    setStatusMessage('Initiating secure transaction...');

    delay(async () => {
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(otp);
      setOtpTimeLeft(120);
      setGatewayState('otp');
      setEnteredOtp('');
      setOtpError('');

      // Trigger OTP notification SMS toast
      await sendSimulatedSms(
        `[BioFarm Secure Pay] OTP for card ending in *${cardNumber.substring(12)} for ₹${safeTotalPrice} is ${otp}. Valid for 2 mins. Do not share.`,
        'otp'
      );
    }, 2000);
  };

  // Verify entered OTP
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    if (otpTimeLeft === 0) {
      setOtpError('OTP expired. Please close payment and try again.');
      return;
    }

    setGatewayState('processing');
    setStatusMessage('Verifying OTP code...');

    delay(() => {
      if (enteredOtp === generatedOtp) {
        setGatewayState('success');
        delay(() => {
          onSuccess(paymentMethod);
        }, 2000);
      } else {
        setGatewayState('otp');
        setOtpError('Invalid OTP. Please check the SMS alert and try again.');
      }
    }, 2000);
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setOtpError('');
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(newOtp);
    setOtpTimeLeft(120);
    
    await sendSimulatedSms(
      `[BioFarm Secure Pay] New OTP for card ending in *${cardNumber.substring(12)} for ₹${safeTotalPrice} is ${newOtp}. Valid for 2 mins.`,
      'otp'
    );
  };

  // Helper to format countdown timer
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getAppName = (app) => {
    const appNames = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM UPI' };
    return appNames[app] || 'UPI';
  };

  return (
    <div className="pg-overlay">
      <div className="pg-container fade-in">
        {/* Gateway Header */}
        <div className="pg-header">
          <div className="pg-brand">
            <span className="pg-lock-icon">🔒 SECURE CHECKOUT</span>
            <h3>BioFarm Pay Gateway</h3>
          </div>
          <button className="pg-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Order Details Bar */}
        <div className="pg-order-summary">
          <div>
            <span className="pg-label">ORDER AMOUNT</span>
            <div className="pg-amount">₹{safeTotalPrice.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="pg-label">ORDER ID</span>
            <div className="pg-order-ref">#200{orderId || 'PENDING'}</div>
          </div>
        </div>

        {/* INPUT FORM STATE */}
        {gatewayState === 'input' && (
          <div>
            {/* Payment Method Selector Tabs */}
            <div className="pg-tabs">
              <button 
                className={`pg-tab ${paymentMethod === 'upi' ? 'active' : ''}`}
                onClick={() => { setPaymentMethod('upi'); setUpiRequestSent(false); }}
              >
                                📱 UPI Apps / QR
              </button>
              <button 
                className={`pg-tab ${paymentMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                💳 Credit / Debit Card
              </button>
            </div>

            {/* TAB 1: UPI PAYMENTS */}
            {paymentMethod === 'upi' && (
              <div className="pg-body fade-in">
                {/* UPI App Intent Icons Grid */}
                <div style={{ marginBottom: '20px' }}>
                  <label className="pg-section-label">⚡ PAY INSTANTLY VIA UPI APP</label>
                  <div className="pg-upi-apps">
                    <button 
                      className={`pg-upi-app-btn gpay ${selectedUpiApp === 'gpay' ? 'active' : ''}`}
                      onClick={() => selectUpiApp('gpay')}
                    >
                      <span className="upi-logo-gpay">G</span>
                      Google Pay
                    </button>
                    <button 
                      className={`pg-upi-app-btn phonepe ${selectedUpiApp === 'phonepe' ? 'active' : ''}`}
                      onClick={() => selectUpiApp('phonepe')}
                    >
                      <span className="upi-logo-phonepe">PE</span>
                      PhonePe
                    </button>
                    <button 
                      className={`pg-upi-app-btn paytm ${selectedUpiApp === 'paytm' ? 'active' : ''}`}
                      onClick={() => selectUpiApp('paytm')}
                    >
                      <span className="upi-logo-paytm">Paytm</span>
                      Paytm
                    </button>
                  </div>
                </div>

                {/* Sub Tab Navigation */}
                <div className="pg-subtabs">
                  <button 
                    className={`pg-subtab ${upiMode === 'qr' ? 'active' : ''}`}
                    onClick={() => { setUpiMode('qr'); setUpiRequestSent(false); setQrImageFailed(false); setTimeLeft(300); }}
                  >
                    Scan QR Code
                  </button>
                  <button 
                    className={`pg-subtab ${upiMode === 'upi_id' ? 'active' : ''}`}
                    onClick={() => { setUpiMode('upi_id'); setUpiRequestSent(false); }}
                  >
                    Enter UPI ID
                  </button>
                </div>

                {/* QR Code Scan Mode */}
                {upiMode === 'qr' && (
                  <div className="pg-qr-section fade-in">
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', textAlign: 'center' }}>
                      Scan this QR code using <strong>{getAppName(selectedUpiApp)}</strong> or any UPI app.
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 'bold', margin: '0 0 12px 0', textAlign: 'center' }}>
                      Direct Payment to Farmer's UPI: {farmerUpiId}
                    </p>
                    <div className="pg-qr-frame">
                      {qrImageFailed ? (
                        <div className="pg-qr-fallback">
                          <strong>QR service unavailable</strong>
                          <span>Use UPI ID {farmerUpiId}</span>
                          <span>Amount ₹{safeTotalPrice.toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          {qrCodeDataUrl ? (
                            <img
                              src={qrCodeDataUrl}
                              alt="UPI Payment QR Code"
                              className="pg-qr-img"
                            />
                          ) : (
                            <div className="pg-loader-small" style={{ margin: '68px auto' }}></div>
                          )}
                          <div className="pg-qr-scanner-line"></div>
                        </>
                      )}
                    </div>
                    <div className="pg-timer-row">
                      <span>⏳ QR Code Expires in:</span>
                      <strong style={{ color: 'var(--danger)' }}>{formatTime(timeLeft)}</strong>
                    </div>
                    
                    <div className="pg-qr-actions">
                      <button
                        className="btn btn-primary btn-block"
                        onClick={handleVerifyUpiPayment}
                      >
                        ✅ I Have Completed Payment (Verify)
                      </button>
                    </div>
                  </div>
                )}

                {/* UPI ID Mode */}
                {upiMode === 'upi_id' && (
                  <div className="pg-upi-id-section fade-in">
                    {!upiRequestSent ? (
                      <form onSubmit={handleSendUpiRequest}>
                        <div className="form-group">
                          <label>Virtual Payment Address (VPA)</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              placeholder="e.g. mobileNumber@ybl, name@okaxis"
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              required
                            />
                            <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                              Send Request
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          This will send a simulated payment request notification toast to your screen.
                        </p>
                      </form>
                    ) : (
                      <div className="pg-request-sent-status fade-in" style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div className="pg-loader-small"></div>
                        <p style={{ fontWeight: 600, marginTop: '12px', color: 'var(--primary)' }}>
                          Simulated request sent to <strong>{upiId}</strong>!
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 16px 0' }}>
                          Please check the SMS notification on your simulated phone banner at the bottom of the screen, approve the collect request, and click verify below.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setUpiRequestSent(false)}>
                            ← Change ID
                          </button>
                          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleVerifyUpiPayment}>
                            Verify Status
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CREDIT / DEBIT CARD PAYMENTS */}
            {paymentMethod === 'card' && (
              <div className="pg-body fade-in">
                {/* 3D CREDIT CARD CONTAINER */}
                <div className="credit-card-scene">
                  <div className={`credit-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
                    {/* Front of Card */}
                    <div className="credit-card-front">
                      <div className="cc-header">
                        <span className="cc-chip">📟</span>
                        <span className="cc-logo">{getCardBrand()}</span>
                      </div>
                      <div className="cc-number">
                        {cardNumber || '•••• •••• •••• ••••'}
                      </div>
                      <div className="cc-footer">
                        <div className="cc-holder">
                          <span className="cc-label">CARD HOLDER</span>
                          <div>{cardName.toUpperCase() || 'YOUR NAME'}</div>
                        </div>
                        <div className="cc-expiry">
                          <span className="cc-label">EXPIRES</span>
                          <div>{cardExpiry || 'MM/YY'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Back of Card */}
                    <div className="credit-card-back">
                      <div className="cc-magnetic-strip"></div>
                      <div className="cc-cvv-strip">
                        <div className="cc-cvv-sig-strip"></div>
                        <div className="cc-cvv-val">{cardCvv || '•••'}</div>
                      </div>
                      <div className="cc-back-info">
                        Secure transaction processed via BioFarm SSL.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Inputs Form */}
                <form onSubmit={handleCardSubmit} style={{ marginTop: '24px' }}>
                  <div className="form-group">
                    <label>Card Number</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="4000 1234 5678 9010"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Cardholder Name</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Pavan Kalyan"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Expiry Date</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={handleExpiryChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>CVV Code</label>
                      <input 
                        type="password" 
                        className="form-control" 
                        placeholder="•••"
                        value={cardCvv}
                        onChange={handleCvvChange}
                        onFocus={() => setIsFlipped(true)}
                        onBlur={() => setIsFlipped(false)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary btn-block">
                    💳 Pay ₹{safeTotalPrice.toFixed(2)} Securely
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* PROCESSING SCREEN */}
        {gatewayState === 'processing' && (
          <div className="pg-status-screen fade-in">
            <div className="pg-status-spinner">
              <div className="pg-loader-inner"></div>
            </div>
            <h4>Processing Payment...</h4>
            <p>{statusMessage}</p>
          </div>
        )}

        {/* UPI PIN screen removed — users scan QR or use Enter UPI ID tab */}

        {/* OTP INPUT SCREEN */}
        {gatewayState === 'otp' && (
          <div className="pg-status-screen fade-in">
            <div className="pg-lock-avatar">🔐</div>
            <h4>Secure Bank OTP Verification</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 16px 0', textAlign: 'center' }}>
              We have simulated sending a 6-digit OTP code to your phone (+91 {profile?.phone || 'N/A'}).
              <br />
              <strong style={{ color: 'var(--secondary)' }}>Check the notification toast at the bottom of the page!</strong>
            </p>

            <form onSubmit={handleVerifyOtp} style={{ width: '100%' }}>
              <div className="form-group">
                <input 
                  type="text" 
                  className="form-control otp-input" 
                  placeholder="Enter 6-Digit OTP"
                  value={enteredOtp}
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  required
                  style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 800 }}
                />
              </div>

              {otpError && <div className="alert alert-danger" style={{ fontSize: '12px', padding: '8px', marginBottom: '12px' }}>{otpError}</div>}

              <div className="pg-timer-row" style={{ justifyContent: 'center', marginBottom: '16px' }}>
                <span>OTP expires in:</span>
                <strong style={{ color: 'var(--danger)', marginLeft: '4px' }}>{formatTime(otpTimeLeft)}</strong>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={handleResendOtp}>
                  Resend OTP
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Submit Code
                </button>
              </div>
            </form>
          </div>
        )}

        {/* SUCCESS SCREEN */}
        {gatewayState === 'success' && (
          <div className="pg-status-screen success fade-in">
            <div className="pg-success-icon">✓</div>
            <h4>Payment Successful!</h4>
            <p>₹{safeTotalPrice.toFixed(2)} received successfully.</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Redirecting you to dashboard...
            </p>
          </div>
        )}

        {/* FAILED / TIMEOUT SCREEN */}
        {gatewayState === 'failed' && (
          <div className="pg-status-screen failed fade-in">
            <div className="pg-failed-icon">✕</div>
            <h4>Transaction Failed</h4>
            <p>{statusMessage}</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '20px' }}
              onClick={() => {
                setTimeLeft(300);
                setOtpTimeLeft(120);
                setStatusMessage('');
                setGatewayState('input');
              }}
            >
              Retry Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentGatewayModal;
