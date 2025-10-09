const crypto = require('crypto');
const validator = require('validator');
const Session = require('../models/Session');

function isValidPhoneNumber(phone) {
  return typeof phone === 'string' && /^\+[1-9]\d{6,14}$/.test(phone);
}

function generateSecureUserId(from) {
  // Use a more secure approach with salt
  const salt = process.env.USER_ID_SALT || 'default_salt_change_in_production';
  return crypto.createHmac('sha256', salt).update(from).digest('hex').slice(0, 16);
}

async function getOrCreate(from) {
  if (!isValidPhoneNumber(from)) {
    throw new Error('invalid_phone_number');
  }

  try {
    // Try to find existing active session
    let session = await Session.findOne({ 
      phoneNumber: from,
      authState: { $ne: 'expired' }
    });

    if (session) {
      // Update last activity
      session.lastActivity = new Date();
      await session.save();
      console.info('Session retrieved', { from, userId: session.userId });
      return {
        sessionId: session.sessionId,
        userId: session.userId,
        from: session.phoneNumber,
        createdAt: session.createdAt.getTime(),
        lastAccessed: session.lastActivity.getTime(),
        authState: session.authState
      };
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    const userId = generateSecureUserId(from);
    
    session = new Session({
      sessionId,
      userId,
      phoneNumber: from,
      authState: 'pending'
    });
    
    await session.save();
    console.info('New session created', { from, userId });
    
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      from: session.phoneNumber,
      createdAt: session.createdAt.getTime(),
      lastAccessed: session.lastActivity.getTime(),
      authState: session.authState
    };
  } catch (error) {
    console.error('Session repository error:', error);
    throw new Error('Failed to create or retrieve session');
  }
}

async function getByPhone(phoneNumber) {
  try {
    const session = await Session.findOne({ 
      phoneNumber,
      authState: { $ne: 'expired' }
    });
    return session ? {
      sessionId: session.sessionId,
      userId: session.userId,
      from: session.phoneNumber,
      createdAt: session.createdAt.getTime(),
      lastAccessed: session.lastActivity.getTime(),
      authState: session.authState
    } : null;
  } catch (error) {
    console.error('Session lookup error:', error);
    return null;
  }
}

async function deleteSession(phoneNumber) {
  try {
    const result = await Session.deleteOne({ phoneNumber });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Session deletion error:', error);
    return false;
  }
}

async function updateSession(phoneNumber, updates) {
  try {
    const session = await Session.findOneAndUpdate(
      { phoneNumber },
      { ...updates, lastActivity: new Date() },
      { new: true }
    );
    return session ? {
      sessionId: session.sessionId,
      userId: session.userId,
      from: session.phoneNumber,
      createdAt: session.createdAt.getTime(),
      lastAccessed: session.lastActivity.getTime(),
      authState: session.authState
    } : null;
  } catch (error) {
    console.error('Session update error:', error);
    return null;
  }
}

async function getSessionStats() {
  try {
    const totalSessions = await Session.countDocuments({ authState: { $ne: 'expired' } });
    return {
      totalSessions,
      maxSessions: 'unlimited (MongoDB)',
      sessionTimeout: '1 hour (auto-expire)'
    };
  } catch (error) {
    console.error('Session stats error:', error);
    return { error: 'Unable to retrieve stats' };
  }
}

module.exports = { getOrCreate, getByPhone, deleteSession, updateSession, getSessionStats };
