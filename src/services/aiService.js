const Groq = require('groq-sdk');
const { z } = require('zod');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Define banking function schemas
const bankingTools = [
  {
    type: 'function',
    function: {
      name: 'check_balance',
      description: 'Get the current balance of user bank accounts',
      parameters: {
        type: 'object',
        properties: {
          account_type: {
            type: 'string',
            description: 'The type of account (checking, savings, or all)',
            enum: ['checking', 'savings', 'all']
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Retrieve recent transaction history for an account',
      parameters: {
        type: 'object',
        properties: {
          account: {
            type: 'string',
            description: 'Account type (checking, savings, or all)',
            enum: ['checking', 'savings', 'all']
          },
          days: {
            type: 'number',
            description: 'Number of days to look back (default: 7)',
            minimum: 1,
            maximum: 90
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transfer_money',
      description: 'Transfer money between user accounts (requires confirmation)',
      parameters: {
        type: 'object',
        properties: {
          from_account: {
            type: 'string',
            description: 'Source account',
            enum: ['checking', 'savings']
          },
          to_account: {
            type: 'string',
            description: 'Destination account',
            enum: ['checking', 'savings']
          },
          amount: {
            type: 'number',
            description: 'Amount to transfer',
            minimum: 0.01
          }
        },
        required: ['from_account', 'to_account', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_spending_insights',
      description: 'Analyze spending patterns and provide insights',
      parameters: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            description: 'Time period for analysis',
            enum: ['week', 'month', 'year']
          },
          category: {
            type: 'string',
            description: 'Spending category to analyze (optional)'
          }
        },
        required: ['timeframe']
      }
    }
  }
];

// System prompt for the banking assistant
const SYSTEM_PROMPT = `You are a helpful banking assistant for a Nigerian bank. You help users manage their accounts via WhatsApp.

Your capabilities:
- Check account balances
- Show recent transactions
- Assist with money transfers (requires confirmation)
- Provide spending insights and financial advice
- Answer banking questions

Important guidelines:
- Always be polite, professional, and concise (WhatsApp messages should be brief)
- For money transfers, ALWAYS confirm the details before proceeding
- Use Nigerian Naira (₦) for currency
- If you don't have information, ask the user or suggest they contact support
- Never make up account balances or transaction data - use the provided functions
- Keep responses under 300 characters when possible for WhatsApp readability

When using functions:
- check_balance: Get current account balances
- get_transactions: Show recent transaction history
- transfer_money: Move money between accounts (REQUIRES USER CONFIRMATION)
- get_spending_insights: Analyze spending patterns`;

/**
 * Process a user message with Groq AI and determine if function calling is needed
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages in the conversation
 * @returns {Promise<Object>} - AI response with potential function call
 */
async function processMessage(userMessage, conversationHistory = []) {
  try {
    // Build messages array with system prompt and conversation history
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    console.info('Calling Groq AI', { 
      messageLength: userMessage.length,
      historyLength: conversationHistory.length 
    });

    // Call Groq with function calling enabled
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Fast and accurate
      messages: messages,
      tools: bankingTools,
      tool_choice: 'auto', // Let AI decide when to use functions
      temperature: 0.7,
      max_tokens: 500
    });

    const choice = response.choices[0];
    
    // Check if AI wants to call a function
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.info('AI requested function call', { 
        function: functionName, 
        args: functionArgs 
      });

      return {
        type: 'function_call',
        function: functionName,
        arguments: functionArgs,
        rawResponse: choice.message
      };
    }

    // Regular text response (no function call)
    console.info('AI returned text response', { 
      length: choice.message.content?.length || 0 
    });

    return {
      type: 'text',
      content: choice.message.content,
      rawResponse: choice.message
    };

  } catch (error) {
    console.error('Groq AI error:', {
      error: error.message,
      code: error.code,
      status: error.status
    });

    // Fallback to basic intent detection if AI fails
    if (error.status === 401) {
      throw new Error('groq_api_key_invalid');
    }
    
    if (error.status === 429) {
      throw new Error('groq_rate_limit_exceeded');
    }

    throw new Error('groq_api_error');
  }
}

/**
 * Generate a natural language response after executing a function
 * @param {string} functionName - Name of the function that was executed
 * @param {Object} functionResult - Result from the function execution
 * @param {Array} conversationHistory - Conversation context
 * @returns {Promise<string>} - Natural language response
 */
async function generateResponseFromFunction(functionName, functionResult, conversationHistory = []) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      {
        role: 'function',
        name: functionName,
        content: JSON.stringify(functionResult)
      }
    ];

    console.info('Generating response from function result', { function: functionName });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
      max_tokens: 400
    });

    return response.choices[0].message.content;

  } catch (error) {
    console.error('Error generating response from function:', error);
    
    // Fallback to basic formatting if AI fails
    if (functionName === 'check_balance') {
      const accounts = functionResult.accounts || [];
      const lines = accounts.map(a => `${a.name}: ₦${a.balance.toLocaleString()}`).join('\n');
      return `Your account balances:\n${lines}`;
    }
    
    return 'I completed that action successfully.';
  }
}

/**
 * Check if Groq API is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Get available banking functions
 * @returns {Array}
 */
function getAvailableFunctions() {
  return bankingTools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description
  }));
}

module.exports = {
  processMessage,
  generateResponseFromFunction,
  isConfigured,
  getAvailableFunctions,
  bankingTools
};
