const Groq = require('groq-sdk');
const TransactionCategory = require('../models/TransactionCategory');
const { logError } = require('../middleware/auditLogger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Transaction Categorization Service
 * Uses AI to categorize transactions intelligently
 */

// Category keywords for rule-based fallback
const categoryKeywords = {
  'Food & Dining': [
    'restaurant', 'food', 'dining', 'cafe', 'coffee', 'pizza', 'burger',
    'chicken', 'kfc', 'mcdonald', 'domino', 'shawarma', 'suya', 'mama put',
    'groceries', 'supermarket', 'shoprite', 'spar', 'grocery'
  ],
  'Transportation': [
    'uber', 'bolt', 'taxi', 'transport', 'fuel', 'petrol', 'gas station',
    'parking', 'toll', 'bus', 'train', 'flight', 'airline', 'lyft'
  ],
  'Utilities': [
    'electric', 'nepa', 'phcn', 'ikeja electric', 'eko electric',
    'water', 'internet', 'wifi', 'mtn', 'glo', 'airtel', '9mobile',
    'dstv', 'gotv', 'startimes'
  ],
  'Housing': [
    'rent', 'mortgage', 'landlord', 'apartment', 'maintenance',
    'repairs', 'plumbing', 'painting'
  ],
  'Entertainment': [
    'netflix', 'spotify', 'cinema', 'movie', 'game', 'gaming',
    'playstation', 'xbox', 'concert', 'show', 'event'
  ],
  'Healthcare': [
    'pharmacy', 'hospital', 'clinic', 'doctor', 'medical', 'health',
    'drug', 'medicine', 'insurance', 'lab test'
  ],
  'Shopping': [
    'jumia', 'konga', 'amazon', 'clothing', 'fashion', 'shoes',
    'electronics', 'phone', 'laptop', 'computer', 'mall'
  ],
  'Savings & Investments': [
    'savings', 'investment', 'mutual fund', 'stock', 'bond',
    'fixed deposit', 'piggyvest', 'cowrywise'
  ],
  'Transfers': [
    'transfer', 'p2p', 'sent to', 'received from', 'bank transfer'
  ],
  'Bills': [
    'bill payment', 'subscription', 'membership', 'insurance premium'
  ]
};

/**
 * Categorize transaction using rule-based approach
 * @param {string} description - Transaction description
 * @returns {object} - Category and confidence
 */
function categorizeByRules(description) {
  const lowerDesc = description.toLowerCase();
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        return {
          category,
          confidence: 0.7,
          method: 'rule-based'
        };
      }
    }
  }
  
  return {
    category: 'Other',
    confidence: 0.5,
    method: 'rule-based'
  };
}

/**
 * Categorize transaction using AI
 * @param {string} description - Transaction description
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type (debit/credit)
 * @returns {Promise<object>} - Category, subcategory, and confidence
 */
async function categorizeWithAI(description, amount, type) {
  try {
    const prompt = `Categorize this transaction into one of these categories:
- Food & Dining
- Transportation
- Utilities
- Housing
- Entertainment
- Healthcare
- Shopping
- Savings & Investments
- Transfers
- Bills
- Other

Transaction: ${description}
Amount: ₦${amount}
Type: ${type}

Respond with a JSON object containing:
{
  "category": "the main category",
  "subcategory": "more specific category (optional)",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}`;

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a financial transaction categorization expert. Analyze transactions and categorize them accurately. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 200
    });
    
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }
    
    // Parse JSON response
    const result = JSON.parse(content);
    
    return {
      category: result.category,
      subcategory: result.subcategory,
      confidence: result.confidence || 0.8,
      method: 'ai',
      reasoning: result.reasoning
    };
    
  } catch (error) {
    logError(error, { context: 'AI categorization' });
    
    // Fallback to rule-based
    return categorizeByRules(description);
  }
}

/**
 * Categorize and save transaction
 * @param {object} transactionData - Transaction data
 * @returns {Promise<object>} - Saved transaction category
 */
async function categorizeTransaction(transactionData) {
  const {
    userId,
    phoneNumber,
    transactionId,
    description,
    amount,
    currency,
    date,
    type
  } = transactionData;
  
  // Check if already categorized
  const existing = await TransactionCategory.findOne({ transactionId });
  if (existing) {
    return existing;
  }
  
  // Categorize
  const categorization = await categorizeWithAI(description, amount, type);
  
  // Save to database
  const transactionCategory = new TransactionCategory({
    userId,
    phoneNumber,
    transactionId,
    description,
    amount,
    currency: currency || 'NGN',
    date: date || new Date(),
    type,
    category: categorization.category,
    subcategory: categorization.subcategory,
    categorizationMethod: categorization.method,
    confidence: categorization.confidence
  });
  
  await transactionCategory.save();
  
  return transactionCategory;
}

/**
 * Get spending by category
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Spending breakdown
 */
async function getSpendingByCategory(userId, startDate, endDate) {
  return await TransactionCategory.getSpendingByCategory(userId, startDate, endDate);
}

/**
 * Get spending for a specific category
 * @param {string} userId - User ID
 * @param {string} category - Category name
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<number>} - Total spending
 */
async function getCategorySpending(userId, category, startDate, endDate) {
  const result = await TransactionCategory.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        category,
        type: 'debit',
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  return result[0]?.total || 0;
}

/**
 * Update category manually
 * @param {string} transactionId - Transaction ID
 * @param {string} newCategory - New category
 * @returns {Promise<object>} - Updated transaction
 */
async function updateCategory(transactionId, newCategory) {
  const transaction = await TransactionCategory.findOne({ transactionId });
  
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  
  transaction.category = newCategory;
  transaction.manuallyEdited = true;
  transaction.userVerified = true;
  
  await transaction.save();
  
  return transaction;
}

module.exports = {
  categorizeTransaction,
  categorizeWithAI,
  categorizeByRules,
  getSpendingByCategory,
  getCategorySpending,
  updateCategory
};
