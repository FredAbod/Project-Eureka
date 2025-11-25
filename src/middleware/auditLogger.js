const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const securityConfig = require('../config/security');

// Create logs directory if it doesn't exist
const logDir = securityConfig.LOG_DIR;

/**
 * Winston Logger Configuration
 * Provides comprehensive audit logging for banking operations
 */

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Transport for general logs with rotation
const generalTransport = new DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: `${securityConfig.LOG_RETENTION_DAYS}d`,
  format: logFormat,
  level: securityConfig.LOG_LEVEL
});

// Transport for error logs with rotation
const errorTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: `${securityConfig.LOG_RETENTION_DAYS}d`,
  format: logFormat,
  level: 'error'
});

// Transport for security audit logs
const auditTransport = new DailyRotateFile({
  filename: path.join(logDir, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: `${securityConfig.LOG_RETENTION_DAYS}d`,
  format: logFormat
});

// Create logger instance
const logger = winston.createLogger({
  level: securityConfig.LOG_LEVEL,
  format: logFormat,
  transports: [
    generalTransport,
    errorTransport
  ],
  exitOnError: false
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create separate audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [auditTransport],
  exitOnError: false
});

/**
 * Log banking operation
 * @param {object} data - Operation data to log
 */
function logBankingOperation(data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'banking_operation',
    userId: data.userId,
    phoneNumber: data.phoneNumber,
    action: data.action,
    accountId: data.accountId,
    amount: data.amount,
    status: data.status,
    responseTime: data.responseTime,
    ip: data.ip,
    metadata: data.metadata || {}
  };
  
  auditLogger.info('Banking Operation', logEntry);
  return logEntry;
}

/**
 * Log authentication event
 * @param {object} data - Authentication data
 */
function logAuthEvent(data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'authentication',
    userId: data.userId,
    phoneNumber: data.phoneNumber,
    event: data.event,
    status: data.status,
    ip: data.ip,
    metadata: data.metadata || {}
  };
  
  auditLogger.info('Authentication Event', logEntry);
  return logEntry;
}

/**
 * Log security event
 * @param {object} data - Security event data
 */
function logSecurityEvent(data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'security',
    severity: data.severity || 'medium',
    event: data.event,
    userId: data.userId,
    phoneNumber: data.phoneNumber,
    ip: data.ip,
    details: data.details || {},
    metadata: data.metadata || {}
  };
  
  auditLogger.warn('Security Event', logEntry);
  return logEntry;
}

/**
 * Log API error
 * @param {object} error - Error object
 * @param {object} context - Error context
 */
function logError(error, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'error',
    message: error.message,
    stack: error.stack,
    userId: context.userId,
    phoneNumber: context.phoneNumber,
    endpoint: context.endpoint,
    method: context.method,
    ip: context.ip,
    metadata: context.metadata || {}
  };
  
  logger.error('Application Error', logEntry);
  return logEntry;
}

/**
 * Log transaction event
 * @param {object} data - Transaction data
 */
function logTransaction(data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'transaction',
    userId: data.userId,
    phoneNumber: data.phoneNumber,
    transactionId: data.transactionId,
    transactionType: data.transactionType,
    amount: data.amount,
    currency: data.currency || 'NGN',
    fromAccount: data.fromAccount,
    toAccount: data.toAccount,
    status: data.status,
    category: data.category,
    metadata: data.metadata || {}
  };
  
  auditLogger.info('Transaction', logEntry);
  return logEntry;
}

/**
 * Express middleware for request logging
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logger.info('Request Completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip
    });
  });
  
  next();
}

module.exports = {
  logger,
  auditLogger,
  logBankingOperation,
  logAuthEvent,
  logSecurityEvent,
  logError,
  logTransaction,
  requestLogger
};
