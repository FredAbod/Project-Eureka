const crypto = require('crypto');
const securityConfig = require('../config/security');
const { logSecurityEvent, logError } = require('./auditLogger');

/**
 * Webhook signature verification middleware
 * Verifies WhatsApp webhook signatures to ensure authenticity
 */

/**
 * Verify webhook signature using HMAC SHA-256
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  
  // Remove 'sha256=' prefix if present
  const signatureValue = signature.replace('sha256=', '');
  
  // Calculate expected signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expectedSignature = hmac.digest('hex');
  
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signatureValue, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Verify timestamp to prevent replay attacks
 * @param {string} timestamp - Timestamp from header
 * @param {number} maxAge - Maximum age in seconds
 * @returns {boolean} - True if timestamp is valid
 */
function verifyTimestamp(timestamp, maxAge = securityConfig.WEBHOOK_MAX_AGE) {
  if (!timestamp) {
    return false;
  }
  
  const requestTime = parseInt(timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  const age = currentTime - requestTime;
  
  return age >= 0 && age <= maxAge;
}

/**
 * Webhook verification middleware
 */
function webhookVerifier(req, res, next) {
  // Skip verification if disabled
  if (!securityConfig.ENABLE_WEBHOOK_VERIFICATION) {
    return next();
  }
  
  try {
    const secret = securityConfig.getWebhookSecret();
    
    if (!secret) {
      logError(new Error('Webhook secret not configured'), {
        endpoint: req.url,
        method: req.method,
        ip: req.ip
      });
      return res.status(500).json({ error: 'Webhook verification not configured' });
    }
    
    // Get signature from header
    const signature = req.get(securityConfig.WEBHOOK_SIGNATURE_HEADER);
    
    if (!signature) {
      logSecurityEvent({
        event: 'webhook_missing_signature',
        severity: 'high',
        ip: req.ip,
        details: {
          url: req.url,
          method: req.method
        }
      });
      
      return res.status(401).json({ error: 'Missing webhook signature' });
    }
    
    // Get timestamp from header
    const timestamp = req.get(securityConfig.WEBHOOK_TIMESTAMP_HEADER);
    
    // Verify timestamp (prevent replay attacks)
    if (timestamp && !verifyTimestamp(timestamp)) {
      logSecurityEvent({
        event: 'webhook_invalid_timestamp',
        severity: 'high',
        ip: req.ip,
        details: {
          timestamp,
          url: req.url,
          method: req.method
        }
      });
      
      return res.status(401).json({ error: 'Invalid or expired timestamp' });
    }
    
    // Verify signature
    const payload = JSON.stringify(req.body);
    
    if (!verifySignature(payload, signature, secret)) {
      logSecurityEvent({
        event: 'webhook_invalid_signature',
        severity: 'critical',
        ip: req.ip,
        details: {
          url: req.url,
          method: req.method,
          signatureProvided: signature.substring(0, 20) + '...'
        }
      });
      
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    // Signature verified successfully
    next();
    
  } catch (error) {
    logError(error, {
      endpoint: req.url,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(500).json({ error: 'Webhook verification failed' });
  }
}

/**
 * Verify webhook challenge (for initial setup)
 */
function verifyWebhookChallenge(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'webhook-verify-token';
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Verification failed' });
  }
}

module.exports = {
  webhookVerifier,
  verifyWebhookChallenge,
  verifySignature,
  verifyTimestamp
};
