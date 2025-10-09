const User = require('../models/User');
const crypto = require('crypto');

function generateSecureUserId(phoneNumber) {
  const salt = process.env.USER_ID_SALT || 'default_salt_change_in_production';
  return crypto.createHmac('sha256', salt).update(phoneNumber).digest('hex').slice(0, 16);
}

async function createUser(phoneNumber, accountData = {}) {
  try {
    const userId = generateSecureUserId(phoneNumber);
    
    const user = new User({
      userId,
      phoneNumber,
      accountData,
      lastLogin: new Date()
    });
    
    await user.save();
    console.info('New user created', { phoneNumber, userId });
    return user.toObject();
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - user already exists
      throw new Error('User already exists');
    }
    console.error('User creation error:', error);
    throw new Error('Failed to create user');
  }
}

async function getUserByPhone(phoneNumber) {
  try {
    const user = await User.findOne({ phoneNumber, isActive: true });
    return user ? user.toObject() : null;
  } catch (error) {
    console.error('User lookup error:', error);
    return null;
  }
}

async function getUserById(userId) {
  try {
    const user = await User.findOne({ userId, isActive: true });
    return user ? user.toObject() : null;
  } catch (error) {
    console.error('User lookup error:', error);
    return null;
  }
}

async function updateUser(phoneNumber, updates) {
  try {
    const user = await User.findOneAndUpdate(
      { phoneNumber, isActive: true },
      { ...updates, lastLogin: new Date() },
      { new: true }
    );
    return user ? user.toObject() : null;
  } catch (error) {
    console.error('User update error:', error);
    return null;
  }
}

async function deactivateUser(phoneNumber) {
  try {
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      { isActive: false },
      { new: true }
    );
    return user ? user.toObject() : null;
  } catch (error) {
    console.error('User deactivation error:', error);
    return null;
  }
}

module.exports = {
  createUser,
  getUserByPhone,
  getUserById,
  updateUser,
  deactivateUser
};