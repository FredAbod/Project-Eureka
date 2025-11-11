/**
 * User Model
 * Represents a user in the Eureka banking platform
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  linkedAccounts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount'
  }],
  preferences: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'pidgin', 'yo', 'ig', 'ha']
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});

// Index for faster lookups
userSchema.index({ phoneNumber: 1 });
userSchema.index({ email: 1 });

// Update lastActive on save
userSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);
