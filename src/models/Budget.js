const mongoose = require('mongoose');

/**
 * Budget Model
 * Stores user budget configurations and tracking
 */

const budgetSchema = new mongoose.Schema({
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
  
  // Budget details
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
      'Other',
      'Total' // Overall budget
    ]
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currency: {
    type: String,
    default: 'NGN'
  },
  
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  
  // Current period tracking
  currentPeriodStart: {
    type: Date,
    required: true
  },
  
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  
  spent: {
    type: Number,
    default: 0
  },
  
  // Alert settings
  alertThresholds: {
    type: [Number],
    default: [0.80, 0.90, 1.00] // 80%, 90%, 100%
  },
  
  alertsSent: {
    type: [Number],
    default: []
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Rollover settings
  rolloverUnspent: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Compound index for user + category + period
budgetSchema.index({ userId: 1, category: 1, period: 1 });
budgetSchema.index({ phoneNumber: 1, isActive: 1 });

// Virtual: Remaining budget
budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.amount - this.spent);
});

// Virtual: Percentage used
budgetSchema.virtual('percentageUsed').get(function() {
  return (this.spent / this.amount) * 100;
});

// Methods
budgetSchema.methods.toJSON = function() {
  const obj = this.toObject({ virtuals: true });
  delete obj.__v;
  return obj;
};

budgetSchema.methods.checkAlerts = function() {
  const percentage = this.percentageUsed;
  const alerts = [];
  
  for (const threshold of this.alertThresholds) {
    const thresholdPercentage = threshold * 100;
    
    // If we've crossed this threshold and haven't sent alert yet
    if (percentage >= thresholdPercentage && !this.alertsSent.includes(threshold)) {
      alerts.push({
        threshold,
        percentage: thresholdPercentage,
        amount: this.amount * threshold,
        remaining: this.remaining
      });
    }
  }
  
  return alerts;
};

budgetSchema.methods.resetPeriod = function() {
  const now = new Date();
  let nextPeriodStart = new Date(this.currentPeriodEnd);
  nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
  
  let nextPeriodEnd;
  switch (this.period) {
    case 'daily':
      nextPeriodEnd = new Date(nextPeriodStart);
      nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 1);
      break;
    case 'weekly':
      nextPeriodEnd = new Date(nextPeriodStart);
      nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 7);
      break;
    case 'monthly':
      nextPeriodEnd = new Date(nextPeriodStart);
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
      break;
    case 'yearly':
      nextPeriodEnd = new Date(nextPeriodStart);
      nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
      break;
  }
  
  const previousSpent = this.spent;
  
  this.currentPeriodStart = nextPeriodStart;
  this.currentPeriodEnd = nextPeriodEnd;
  this.spent = this.rolloverUnspent ? Math.max(0, previousSpent - this.amount) : 0;
  this.alertsSent = [];
};

// Static methods
budgetSchema.statics.getActiveBudgets = async function(userId) {
  return await this.find({ userId, isActive: true });
};

budgetSchema.statics.getBudgetByCategory = async function(userId, category) {
  return await this.findOne({ userId, category, isActive: true });
};

budgetSchema.statics.updateSpending = async function(userId, category, amount) {
  const budget = await this.findOne({ userId, category, isActive: true });
  
  if (budget) {
    // Check if we need to reset period
    const now = new Date();
    if (now > budget.currentPeriodEnd) {
      budget.resetPeriod();
    }
    
    budget.spent += amount;
    await budget.save();
    
    return budget;
  }
  
  return null;
};

module.exports = mongoose.model('Budget', budgetSchema);
