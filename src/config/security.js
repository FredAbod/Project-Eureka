/**
 * Security Configuration
 * Central location for all security-related constants and limits
 */

module.exports = {
  // Transaction limits (in Naira)
  DAILY_TRANSFER_LIMIT: 50000, // ₦50,000
  MONTHLY_TRANSFER_LIMIT: 500000, // ₦500,000
  MAX_TRANSACTIONS_PER_DAY: 10,
  SINGLE_TRANSACTION_MAX: 100000, // ₦100,000
  
  // Confirmation thresholds
  REQUIRE_CONFIRMATION_ABOVE: 10000, // ₦10,000
  REQUIRE_PIN_ABOVE: 5000, // ₦5,000
  
  // Session settings
  SESSION_TIMEOUT: 3600000, // 1 hour in milliseconds
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_DURATION: 900000, // 15 minutes
  
  // Encryption
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,
  IV_LENGTH: 16,
  AUTH_TAG_LENGTH: 16,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Webhook verification
  WEBHOOK_SIGNATURE_HEADER: 'x-hub-signature-256',
  WEBHOOK_TIMESTAMP_HEADER: 'x-whatsapp-timestamp',
  WEBHOOK_MAX_AGE: 300, // 5 minutes (prevent replay attacks)
  
  // Token expiration
  ACCESS_TOKEN_EXPIRY: 3600, // 1 hour
  REFRESH_TOKEN_EXPIRY: 604800, // 7 days
  
  // Password requirements
  MIN_PASSWORD_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  
  // Fraud detection thresholds
  SUSPICIOUS_TRANSACTION_THRESHOLD: 50000, // ₦50,000
  MAX_FAILED_TRANSACTIONS: 3,
  UNUSUAL_HOUR_START: 23, // 11 PM
  UNUSUAL_HOUR_END: 6, // 6 AM
  
  // API keys and secrets (loaded from environment)
  getWebhookSecret() {
    return process.env.WEBHOOK_SECRET;
  },
  
  getEncryptionKey() {
    return process.env.ENCRYPTION_KEY;
  },
  
  getJwtSecret() {
    return process.env.JWT_SECRET || 'fallback-secret-change-this';
  },
  
  // Feature flags
  ENABLE_ENCRYPTION: true,
  ENABLE_AUDIT_LOGGING: true,
  ENABLE_WEBHOOK_VERIFICATION: true,
  ENABLE_RATE_LIMITING: true,
  ENABLE_TRANSACTION_LIMITS: true,
  
  // Audit log settings
  LOG_RETENTION_DAYS: 30,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_DIR: process.env.LOG_DIR || './logs',
  
  // Budget settings
  DEFAULT_CURRENCY: 'NGN',
  BUDGET_ALERT_THRESHOLD_80: 0.80, // 80%
  BUDGET_ALERT_THRESHOLD_90: 0.90, // 90%
  BUDGET_ALERT_THRESHOLD_100: 1.00, // 100%
  
  // Transaction categories
  TRANSACTION_CATEGORIES: [
    'Food & Dining',
    'Transportation',
    'Utilities',
    'Housing',
    'Entertainment',
    'Healthcare',
    'Shopping',
    'Savings & Investments',
    'Transfers',
    'Bills',
    'Other'
  ]
};
