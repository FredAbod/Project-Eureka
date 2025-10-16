const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  authState: {
    type: String,
    enum: ['pending', 'authenticated', 'expired'],
    default: 'pending'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  conversationHistory: {
    type: [{
      role: {
        type: String,
        enum: ['user', 'assistant', 'system', 'function'],
        required: true
      },
      content: {
        type: String,
        required: true
      },
      timestamp: {
        type: Number,
        default: Date.now
      }
    }],
    default: []
  },
  pendingTransaction: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

// TTL index for automatic session cleanup after 1 hour
sessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('Session', sessionSchema);