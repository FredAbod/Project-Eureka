const Budget = require('../models/Budget');
const { logError } = require('../middleware/auditLogger');

/**
 * Budget Service
 * Manages budget creation, tracking, and alerts
 */

/**
 * Create a new budget
 * @param {object} budgetData - Budget configuration
 * @returns {Promise<object>} - Created budget
 */
async function createBudget(budgetData) {
  const {
    userId,
    phoneNumber,
    category,
    amount,
    period = 'monthly',
    rolloverUnspent = false
  } = budgetData;
  
  // Check if budget already exists for this category
  const existing = await Budget.findOne({
    userId,
    category,
    period,
    isActive: true
  });
  
  if (existing) {
    throw new Error(`Budget already exists for ${category}. Update it instead.`);
  }
  
  // Calculate period dates
  const now = new Date();
  const periodDates = calculatePeriodDates(period, now);
  
  const budget = new Budget({
    userId,
    phoneNumber,
    category,
    amount,
    period,
    currentPeriodStart: periodDates.start,
    currentPeriodEnd: periodDates.end,
    rolloverUnspent
  });
  
  await budget.save();
  
  return budget;
}

/**
 * Calculate period start and end dates
 * @param {string} period - Period type
 * @param {Date} referenceDate - Reference date
 * @returns {object} - Start and end dates
 */
function calculatePeriodDates(period, referenceDate = new Date()) {
  const start = new Date(referenceDate);
  const end = new Date(referenceDate);
  
  switch (period) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
      
    case 'weekly':
      // Start from Monday
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
      
    case 'monthly':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
      
    case 'yearly':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }
  
  return { start, end };
}

/**
 * Update budget amount
 * @param {string} budgetId - Budget ID
 * @param {number} newAmount - New budget amount
 * @returns {Promise<object>} - Updated budget
 */
async function updateBudgetAmount(budgetId, newAmount) {
  const budget = await Budget.findById(budgetId);
  
  if (!budget) {
    throw new Error('Budget not found');
  }
  
  budget.amount = newAmount;
  await budget.save();
  
  return budget;
}

/**
 * Update spending and check for alerts
 * @param {string} userId - User ID
 * @param {string} category - Transaction category
 * @param {number} amount - Transaction amount
 * @returns {Promise<object>} - Budget with alerts
 */
async function recordSpending(userId, category, amount) {
  // Update category budget
  let budget = await Budget.getBudgetByCategory(userId, category);
  
  if (budget) {
    // Check if period needs reset
    const now = new Date();
    if (now > budget.currentPeriodEnd) {
      budget.resetPeriod();
    }
    
    budget.spent += amount;
    
    // Check for alerts
    const alerts = budget.checkAlerts();
    
    // Mark alerts as sent
    for (const alert of alerts) {
      if (!budget.alertsSent.includes(alert.threshold)) {
        budget.alertsSent.push(alert.threshold);
      }
    }
    
    await budget.save();
    
    return {
      budget,
      alerts
    };
  }
  
  // Also update total budget if exists
  const totalBudget = await Budget.getBudgetByCategory(userId, 'Total');
  
  if (totalBudget) {
    const now = new Date();
    if (now > totalBudget.currentPeriodEnd) {
      totalBudget.resetPeriod();
    }
    
    totalBudget.spent += amount;
    const totalAlerts = totalBudget.checkAlerts();
    
    for (const alert of totalAlerts) {
      if (!totalBudget.alertsSent.includes(alert.threshold)) {
        totalBudget.alertsSent.push(alert.threshold);
      }
    }
    
    await totalBudget.save();
    
    return {
      budget: totalBudget,
      alerts: totalAlerts
    };
  }
  
  return null;
}

/**
 * Get user's active budgets
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Active budgets
 */
async function getUserBudgets(userId) {
  const budgets = await Budget.getActiveBudgets(userId);
  
  // Reset periods if needed
  const now = new Date();
  for (const budget of budgets) {
    if (now > budget.currentPeriodEnd) {
      budget.resetPeriod();
      await budget.save();
    }
  }
  
  return budgets;
}

/**
 * Get budget summary
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Budget summary
 */
async function getBudgetSummary(userId) {
  const budgets = await getUserBudgets(userId);
  
  const summary = {
    totalBudgets: budgets.length,
    totalBudgeted: 0,
    totalSpent: 0,
    budgets: []
  };
  
  for (const budget of budgets) {
    summary.totalBudgeted += budget.amount;
    summary.totalSpent += budget.spent;
    
    summary.budgets.push({
      category: budget.category,
      amount: budget.amount,
      spent: budget.spent,
      remaining: budget.remaining,
      percentageUsed: budget.percentageUsed,
      period: budget.period,
      periodEnd: budget.currentPeriodEnd
    });
  }
  
  summary.overallPercentage = (summary.totalSpent / summary.totalBudgeted) * 100;
  summary.totalRemaining = summary.totalBudgeted - summary.totalSpent;
  
  return summary;
}

/**
 * Delete/deactivate budget
 * @param {string} budgetId - Budget ID
 * @returns {Promise<object>} - Deleted budget
 */
async function deleteBudget(budgetId) {
  const budget = await Budget.findById(budgetId);
  
  if (!budget) {
    throw new Error('Budget not found');
  }
  
  budget.isActive = false;
  await budget.save();
  
  return budget;
}

/**
 * Format budget alert message
 * @param {object} alert - Alert data
 * @param {object} budget - Budget data
 * @returns {string} - Formatted message
 */
function formatBudgetAlert(alert, budget) {
  const emoji = alert.threshold >= 1.0 ? '🚨' : alert.threshold >= 0.9 ? '⚠️' : '⚡';
  const percentage = Math.round(alert.percentage);
  
  return `${emoji} *Budget Alert*\n\n` +
    `Category: ${budget.category}\n` +
    `Budget: ₦${budget.amount.toLocaleString()}\n` +
    `Spent: ₦${budget.spent.toLocaleString()} (${percentage}%)\n` +
    `Remaining: ₦${budget.remaining.toLocaleString()}\n\n` +
    (alert.threshold >= 1.0 
      ? '❌ You have exceeded your budget!' 
      : `You have ₦${budget.remaining.toLocaleString()} left for ${budget.category}.`);
}

module.exports = {
  createBudget,
  updateBudgetAmount,
  recordSpending,
  getUserBudgets,
  getBudgetSummary,
  deleteBudget,
  formatBudgetAlert,
  calculatePeriodDates
};
