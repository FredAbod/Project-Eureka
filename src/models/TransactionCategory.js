const mongoose = require('mongoose');

/**
 * Transaction Category Model
 * Stores transaction categorization data
 */

const transactionCategorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Transaction details
  description: {
    type: String,
    required: true
  },
  
  amount: {
    type: Number,
    required: true
  },
  
  currency: {
    type: String,
    default: 'NGN'
  },
  
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  type: {
    type: String,
    enum: ['debit', 'credit'],
    required: true
  },
  
  // Categorization
  category: {
    type: String,
    required: true,
    enum: [
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
    ],
    index: true
  },
  
  subcategory: {
    type: String
  },
  
  // Categorization metadata
  categorizationMethod: {
    type: String,
    enum: ['ai', 'manual', 'rule-based'],
    default: 'ai'
  },
  
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  
  // User feedback
  userVerified: {
    type: Boolean,
    default: false
  },
  
  manuallyEdited: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  merchant: {
    type: String
  },
  
  location: {
    type: String
  },
  
  tags: [{
    type: String
  }],
  
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
transactionCategorySchema.index({ userId: 1, date: -1 });
transactionCategorySchema.index({ userId: 1, category: 1, date: -1 });
transactionCategorySchema.index({ phoneNumber: 1, date: -1 });

// Methods
transactionCategorySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Static methods
transactionCategorySchema.statics.getCategoriesByUser = async function(userId, startDate, endDate) {
  return await this.find({
    userId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: -1 });
};

transactionCategorySchema.statics.getSpendingByCategory = async function(userId, startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        type: 'debit',
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$category',
        totalSpent: { $sum: '$amount' },
        count: { $sum: 1 },
        avgTransaction: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalSpent: -1 }
    }
  ]);
};

module.exports = mongoose.model('TransactionCategory', transactionCategorySchema);
