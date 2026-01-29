/**
 * User Model
 * Represents a user in the Eureka banking platform
 */

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  // Web authentication fields
  password: {
    type: String,
    required: false, // Optional for WhatsApp-only users
    select: false, // Never return in queries by default
  },
  refreshTokenHash: {
    type: String,
    select: false, // Never expose token hashes
  },
  lastLoginAt: {
    type: Date,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockoutUntil: {
    type: Date,
  },
  linkedAccounts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
    },
  ],
  preferences: {
    language: {
      type: String,
      default: "en",
      enum: ["en", "pidgin", "yo", "ig", "ha"],
    },
    notifications: {
      type: Boolean,
      default: true,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
});

// Update lastActive on save
userSchema.pre("save", function (next) {
  this.lastActive = new Date();
  next();
});

module.exports = mongoose.model("User", userSchema);
