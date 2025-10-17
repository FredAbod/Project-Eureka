const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  accountData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Bank account connection status
  bankAccountConnected: {
    type: Boolean,
    default: false
  },
  bankAccountId: {
    type: String,
    default: null
  },
  bankConnectionDate: {
    type: Date,
    default: null
  },
  // For storing temporary connection state during onboarding
  connectionState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  preferences: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);