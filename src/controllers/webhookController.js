const crypto = require('crypto');
const validator = require('validator');
const webhookService = require('../services/webhookService');
const whatsappAdapter = require('../utils/whatsappAdapter');

// Verification endpoint used by WhatsApp Cloud API when setting webhook URL
function verify(req, res) {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Input validation
    if (!mode || !token || !challenge) {
      console.warn('Webhook verification failed: missing parameters', { ip: req.ip });
      return res.sendStatus(400);
    }

    // Facebook sends numeric challenges, so allow alphanumeric + numbers
    if (!validator.isAlphanumeric(challenge, 'en-US', { ignore: '_-' }) && !validator.isNumeric(challenge)) {
      console.warn('Webhook verification failed: invalid challenge format', { ip: req.ip });
      return res.sendStatus(400);
    }

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verification successful', { ip: req.ip });
      return res.status(200).send(challenge);
    }
    
    console.warn('Webhook verification failed: invalid token', { ip: req.ip, mode });
    return res.sendStatus(403);
  } catch (err) {
    console.error('Webhook verification error:', err);
    return res.sendStatus(500);
  }
}

// Verify WhatsApp signature (Meta's webhook signature verification)
function verifyWhatsAppSignature(payload, signature) {
  if (!process.env.WHATSAPP_WEBHOOK_SECRET) {
    console.warn('WHATSAPP_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Allow in dev, but log warning
  }

  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  const providedSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
}

// Validate and normalize phone number format
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  // Remove any whitespace
  phone = phone.trim();
  
  // If missing +, add it for common formats
  if (!phone.startsWith('+') && /^[1-9]\d{6,14}$/.test(phone)) {
    phone = '+' + phone;
  }
  
  // Basic E.164 format validation: starts with +, followed by 7-15 digits
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// Normalize phone number to E.164 format
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;
  
  phone = phone.trim();
  
  // Add + if missing for valid numbers
  if (!phone.startsWith('+') && /^[1-9]\d{6,14}$/.test(phone)) {
    phone = '+' + phone;
  }
  
  return isValidPhoneNumber(phone) ? phone : null;
}

// Normalize incoming webhook payloads from WhatsApp Cloud API (or Twilio) to our event shape
function normalizeWhatsAppPayload(body) {
  try {
    const entry = body.entry && body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value = changes && changes.value;
    const messages = value && value.messages && value.messages[0];
    
    if (!messages) return null;
    
    const rawFrom = messages.from;
    const text = messages.text && messages.text.body;
    
    // Normalize and validate phone number
    const from = normalizePhoneNumber(rawFrom);
    if (!from) {
      console.warn('Invalid phone number format:', rawFrom);
      return null;
    }
    
    if (text && text.length > 1000) {
      console.warn('Message text too long, truncating:', from);
      return { from, text: text.slice(0, 1000), raw: messages };
    }
    
    return { from, text, raw: messages };
  } catch (e) {
    console.error('Error normalizing WhatsApp payload:', e.message);
    return null;
  }
}

async function receive(req, res, next) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  try {
    // Verify WhatsApp signature if provided
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = JSON.stringify(req.body);
    
    // Skip signature verification in development if no secret is set
    if (process.env.WHATSAPP_WEBHOOK_SECRET && !verifyWhatsAppSignature(rawBody, signature)) {
      console.warn('Webhook signature verification failed', { 
        ip: req.ip, 
        requestId,
        hasSignature: !!signature 
      });
      return res.sendStatus(403);
    } else if (!process.env.WHATSAPP_WEBHOOK_SECRET) {
      console.info('Skipping signature verification (no WHATSAPP_WEBHOOK_SECRET set)', { requestId });
    }

    // Normalize payload
    const event = normalizeWhatsAppPayload(req.body) || req.body;

    if (!event || !event.from || !event.text) {
      console.info('Ignoring invalid/empty webhook event', { requestId, hasEvent: !!event });
      return res.status(200).json({ ok: true }); // Always return 200 to WhatsApp
    }

    // Process message
    console.info('Processing webhook event', { 
      from: event.from, 
      textLength: event.text?.length || 0,
      requestId 
    });
    
  const reply = await webhookService.handleEvent(event);

  // Send outbound via adapter (this will simulate unless configured)
  await whatsappAdapter.sendMessage(event.from, reply.text);

  const duration = Date.now() - startTime;
  console.info('Webhook processing completed', { requestId, duration });
    
    // For easier testing in development, return the generated reply in the HTTP response.
    // In production, keep the response minimal to match webhook expectations.
    if (process.env.NODE_ENV === 'production') {
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true, reply });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('Webhook processing error', { 
      requestId, 
      duration,
      error: err.message,
      stack: err.stack 
    });
    next(err);
  }
}

module.exports = { receive, verify };
