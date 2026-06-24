/**
 * SMS Notification Module — BioFarm
 *
 * Supports:
 *   1. Fast2SMS  — Free Indian SMS gateway (https://www.fast2sms.com)
 *   2. Twilio    — Global SMS provider (https://www.twilio.com)
 *
 * Configure via .env:
 *   SMS_PROVIDER=fast2sms   (or 'twilio')
 *   FAST2SMS_API_KEY=...
 *   TWILIO_ACCOUNT_SID=...
 *   TWILIO_AUTH_TOKEN=...
 *   TWILIO_FROM_NUMBER=+1XXXXXXXXXX
 */

const axios = require('axios');

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'fast2sms';

/**
 * Clean a phone number to just digits (removes +91, spaces, dashes etc.)
 * Fast2SMS requires 10-digit Indian mobile numbers.
 */
function cleanPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // If it starts with country code 91, strip it
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 10) return digits;
  return null; // invalid
}

/**
 * Send SMS via Fast2SMS (free tier available, India only)
 * Sign up at https://www.fast2sms.com → API → DLT Route or Quick SMS
 */
async function sendViaSMS(phone, message) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.warn('[SMS] FAST2SMS_API_KEY not set. Skipping SMS.');
    return false;
  }

  const mobile = cleanPhone(phone);
  if (!mobile) {
    console.warn(`[SMS] Invalid phone number: ${phone}. Skipping.`);
    return false;
  }

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',          // Quick SMS route (no template needed for testing)
        message: message,
        language: 'english',
        flash: 0,
        numbers: mobile
      },
      {
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data?.return === true) {
      console.log(`[SMS] ✅ Fast2SMS sent to ${mobile}: ${message.substring(0, 50)}...`);
      return true;
    } else {
      console.warn(`[SMS] ⚠️ Fast2SMS failed:`, response.data?.message || response.data);
      return false;
    }
  } catch (err) {
    console.error(`[SMS] ❌ Fast2SMS error:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Send SMS via Twilio (global, requires paid account or trial)
 * Sign up at https://www.twilio.com/try-twilio
 */
async function sendViaTwilio(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[SMS] Twilio credentials not set. Skipping SMS.');
    return false;
  }

  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({
        To: phone,
        From: fromNumber,
        Body: message
      }),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      }
    );

    if (response.data?.sid) {
      console.log(`[SMS] ✅ Twilio sent to ${phone}. SID: ${response.data.sid}`);
      return true;
    } else {
      console.warn(`[SMS] ⚠️ Twilio unexpected response:`, response.data);
      return false;
    }
  } catch (err) {
    console.error(`[SMS] ❌ Twilio error:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Main SMS sender — picks provider based on SMS_PROVIDER env var.
 *
 * @param {string} phone - Phone number (any format, e.g. "+91 99999 88888")
 * @param {string} message - SMS message text
 * @returns {Promise<boolean>} - true if sent, false if failed/skipped
 */
async function sendSMS(phone, message) {
  if (!phone || phone === 'N/A') {
    console.log('[SMS] No phone number provided, skipping.');
    return false;
  }

  console.log(`[SMS] Sending via ${SMS_PROVIDER} to ${phone}...`);

  if (SMS_PROVIDER === 'twilio') {
    return await sendViaTwilio(phone, message);
  } else {
    // Default: Fast2SMS
    return await sendViaSMS(phone, message);
  }
}

module.exports = { sendSMS };
