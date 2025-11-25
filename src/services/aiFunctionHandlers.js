/**
 * AI Function Handlers
 * Handlers for new AI-powered banking functions
 */

const categorizationService = require('./categorizationService');
const budgetService = require('./budgetService');
const TransactionCategory = require('../models/TransactionCategory');
const Budget = require('../models/Budget');

/**
 * Set a budget for a category
 * @param {object} args - Function arguments from AI
 * @param {string} userId - User ID
 * @param {string} phoneNumber - User phone number
 * @returns {Promise<object>} - Budget creation result
 */
async function handleSetBudget(args, userId, phoneNumber) {
  const { category, amount, period  = 'monthly' } = args;
  
  try {
    const budget = await budgetService.createBudget({
      userId,
      phoneNumber,
      category,
      amount,
      period
    });
    
    return {
      success: true,
      message: `Budget set successfully`,
      budget: {
        category: budget.category,
        amount: budget.amount,
        period: budget.period,
        periodEnd: budget.currentPeriodEnd
      }
    };
  } catch (error) {
    if (error.message.includes('already exists')) {
      return {
        success: false,
        error: `You already have a budget for ${category}. Would you like to update it?`
      };
    }
    throw error;
  }
}

/**
 * Get budget status and summary
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Budget summary
 */
async function handleGetBudgetStatus(userId) {
  const summary = await budgetService.getBudgetSummary(userId);
  
  return {
    success: true,
    summary: {
      totalBudgets: summary.totalBudgets,
      totalBudgeted: summary.totalBudgeted,
      totalSpent: summary.totalSpent,
      totalRemaining: summary.totalRemaining,
      overallPercentage: Math.round(summary.overallPercentage),
      budgets: summary.budgets.map(b => ({
        category: b.category,
        budgeted: b.amount,
        spent: b.spent,
        remaining: b.remaining,
        percentageUsed: Math.round(b.percentageUsed)
      }))
    }
  };
}

/**
 * Analyze spending for a category/period
 * @param {object} args - Function arguments
 * @param{string} userId - User ID
 * @returns {Promise<object>} - Spending analysis
 */
async function handleAnalyzeSpending(args, userId) {
  const { category, period } = args;
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }
  
  // Get spending data
  let spendingData;
  if (category) {
    const total = await categorizationService.getCategorySpending(userId, category, startDate, endDate);
    spendingData = [{ _id: category, totalSpent: total, count: 0 }];
  } else {
    spendingData = await categorizationService.getSpendingByCategory(userId, startDate, endDate);
  }
  
  return {
    success: true,
    period,
    startDate,
    endDate,
    spending: spendingData.map(s => ({
      category: s._id,
      totalSpent: s.totalSpent,
      transactionCount: s.count || 0,
      averageTransaction: s.avgTransaction || 0
    }))
  };
}

/**
 * Get financial advice
 * @param {object} args - Function arguments
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Financial advice context
 */
async function handleGetFinancialAdvice(args, userId) {
  const { topic, amount } = args;
  
  // Get user's budget and spending data for context
  const budgetSummary = await budgetService.getBudgetSummary(userId);
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);
  
  const monthlySpending = await categorizationService.getSpendingByCategory(userId, startDate, endDate);
  
  const totalSpent = monthlySpending.reduce((sum, s) => sum + s.totalSpent, 0);
  const topCategory = monthlySpending[0];
  
  return {
    success: true,
    topic,
    amount,
    context: {
      monthlySpending: totalSpent,
      topSpendingCategory: topCategory?._id || 'Unknown',
      topCategoryAmount: topCategory?.totalSpent || 0,
      budgets: budgetSummary.budgets.length,
      totalBudgeted: budgetSummary.totalBudgeted,
      budgetRemaining: budgetSummary.totalRemaining
    }
  };
}

/**
 * Compare spending across periods
 * @param {object} args - Function arguments
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Spending comparison
 */
async function handleCompareSpending(args, userId) {
  const { period1, period2 } = args;
  
  const calculatePeriodDates = (periodStr) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    
    switch (periodStr) {
      case 'this_week':
        start.setDate(now.getDate() - now.getDay());
        end.setTime(now.getTime());
        break;
      case 'last_week':
        start.setDate(now.getDate() - now.getDay() - 7);
        end.setDate(now.getDate() - now.getDay() - 1);
        break;
      case 'this_month':
        start.setDate(1);
        end.setTime(now.getTime());
        break;
      case 'last_month':
        start.setMonth(now.getMonth() - 1, 1);
        end.setMonth(now.getMonth(), 0);
        break;
      case 'this_year':
        start.setMonth(0, 1);
        end.setTime(now.getTime());
        break;
      case 'last_year':
start.setFullYear(now.getFullYear() - 1, 0, 1);
        end.setFullYear(now.getFullYear() - 1, 11, 31);
        break;
    }
    
    return { start, end };
  };
  
  const dates1 = calculatePeriodDates(period1);
  const dates2 = calculatePeriodDates(period2);
  
  const spending1 = await categorizationService.getSpendingByCategory(userId, dates1.start, dates1.end);
  const spending2 = await categorizationService.getSpendingByCategory(userId, dates2.start, dates2.end);
  
  const total1 = spending1.reduce((sum, s) => sum + s.totalSpent, 0);
  const total2 = spending2.reduce((sum, s) => sum + s.totalSpent, 0);
  
  const difference = total1 - total2;
  const percentageChange = total2 > 0 ? ((difference / total2) * 100) : 0;
  
  return {
    success: true,
    period1: {
      name: period1,
      totalSpent: total1,
      topCategories: spending1.slice(0, 3)
    },
    period2: {
      name: period2,
      totalSpent: total2,
      topCategories: spending2.slice(0, 3)
    },
    comparison: {
      difference,
      percentageChange: Math.round(percentageChange),
      trend: difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'same'
    }
  };
}

module.exports = {
  handleSetBudget,
  handleGetBudgetStatus,
  handleAnalyzeSpending,
  handleGetFinancialAdvice,
  handleCompareSpending
};
