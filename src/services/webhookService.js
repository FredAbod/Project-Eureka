const validator = require('validator');
const sessionRepo = require('../repositories/sessionRepository');
const bankService = require('./bankService');

// Rate limiting per user
const userRequestCounts = new Map();
const USER_RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Clean rate limiting data
setInterval(() => {
  userRequestCounts.clear();
}, RATE_LIMIT_WINDOW);

function isRateLimited(userId) {
  const now = Date.now();
  const userRequests = userRequestCounts.get(userId) || { count: 0, windowStart: now };
  
  if (now - userRequests.windowStart > RATE_LIMIT_WINDOW) {
    userRequests.count = 1;
    userRequests.windowStart = now;
  } else {
    userRequests.count++;
  }
  
  userRequestCounts.set(userId, userRequests);
  return userRequests.count > USER_RATE_LIMIT;
}

function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove potentially dangerous characters and normalize
  return validator.escape(text.trim().toLowerCase());
}

function detectIntent(text) {
  const normalized = sanitizeInput(text);
  
  if (!normalized) return 'empty';
  if (normalized === 'help') return 'help';
  if (normalized.includes('balance')) return 'balance';
  if (normalized.includes('transaction') || normalized.includes('recent')) return 'transactions';
  
  return 'unknown';
}

async function handleEvent(event) {
  try {
    const from = event.from;
    const text = (event.text || '').trim();
    
    if (!text) {
      return { text: "I didn't receive any text. Send 'help' for available commands." };
    }

    const session = await sessionRepo.getOrCreate(from);
    
    // Check rate limiting per user
    if (isRateLimited(session.userId)) {
      console.warn('Rate limit exceeded', { userId: session.userId, from });
      return { 
        text: 'You\'re sending messages too quickly. Please wait a moment before trying again.' 
      };
    }

    const intent = detectIntent(text);
    console.info('Intent detected', { intent, from: session.from, requestCount: session.requestCount });
    
    switch (intent) {
      case 'balance':
        const accounts = await bankService.getAccountsForUser(session.userId);
        if (!accounts || accounts.length === 0) {
          return { text: 'No accounts found. Please contact support.' };
        }
        const lines = accounts.map(a => `${validator.escape(a.name)}: $${a.balance.toFixed(2)}`).join('\n');
        return { text: `You have ${accounts.length} account(s):\n${lines}` };
        
      case 'transactions':
        const txs = await bankService.getTransactionsForUser(session.userId);
        if (!txs || txs.length === 0) {
          return { text: 'No recent transactions found.' };
        }
        const list = txs.slice(0, 5).map(t => 
          `${validator.escape(t.date)} ${validator.escape(t.desc)} $${t.amount.toFixed(2)}`
        ).join('\n');
        return { text: `Recent transactions:\n${list}` };
        
      case 'help':
        return { 
          text: "Available commands:\n• 'balance' - Check account balances\n• 'transactions' - View recent transactions\n• 'help' - Show this help" 
        };
        
      default:
        return { 
          text: "I didn't understand that command. Send 'help' to see available options." 
        };
    }
  } catch (err) {
    console.error('Error handling webhook event:', {
      error: err.message,
      from: event.from,
      stack: err.stack
    });
    
    if (err.message === 'session_limit_exceeded') {
      return { text: 'Service temporarily unavailable. Please try again later.' };
    }
    
    return { text: 'Sorry, there was an error processing your request. Please try again.' };
  }
}

module.exports = { handleEvent };
