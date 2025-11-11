/**
 * BankAccount Model
 * Represents a linked bank account from Mono
 */

const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  monoAccountId: {
    type: String,
    required: true,
    unique: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  accountName: {
    type: String,
    required: true
  },
  bankName: {
    type: String,
    required: true
  },
  bankCode: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  accountType: {
    type: String,
    enum: ['savings', 'current', 'domiciliary'],
    default: 'savings'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  lastSynced: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster lookups
bankAccountSchema.index({ userId: 1 });
bankAccountSchema.index({ monoAccountId: 1 });
bankAccountSchema.index({ accountNumber: 1 });

// Ensure only one primary account per user
bankAccountSchema.pre('save', async function(next) {
  if (this.isPrimary) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isPrimary: false }
    );
  }
  next();
});

module.exports = mongoose.model('BankAccount', bankAccountSchema);
