const validator = require('validator');
const sessionRepo = require('../repositories/sessionRepository');
const userRepo = require('../repositories/userRepository');
const bankService = require('./bankService');
const aiService = require('./aiService');
const conversationService = require('./conversationService');
const accountConnectionService = require('./accountConnectionService');

// Rate limiting per user
const userRequestCounts = new Map();
const USER_RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Clean rate limiting data
setInterval(() => {
  userRequestCounts.clear();
}, RATE_LIMIT_WINDOW);

function isRateLimited(userId) {
  const now = Date.now();
  const userRequests = userRequestCounts.get(userId) || { count: 0, windowStart: now };
  
  if (now - userRequests.windowStart > RATE_LIMIT_WINDOW) {
    userRequests.count = 1;
    userRequests.windowStart = now;
  } else {
    userRequests.count++;
  }
  
  userRequestCounts.set(userId, userRequests);
  return userRequests.count > USER_RATE_LIMIT;
}

function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove potentially dangerous characters and normalize
  return validator.escape(text.trim().toLowerCase());
}

function detectIntent(text) {
  const normalized = sanitizeInput(text);
  
  if (!normalized) return 'empty';
  if (normalized === 'help') return 'help';
  if (normalized.includes('balance')) return 'balance';
  if (normalized.includes('transaction') || normalized.includes('recent')) return 'transactions';
  
  return 'unknown';
}

async function handleEvent(event) {
  try {
    const from = event.from;
    const text = (event.text || '').trim();
    
    if (!text) {
      return { text: "I didn't receive any text. Send 'help' for available commands." };
    }

    const session = await sessionRepo.getOrCreate(from);
    
    // Check rate limiting per user
    if (isRateLimited(session.userId)) {
      console.warn('Rate limit exceeded', { userId: session.userId, from });
      return { 
        text: 'You\'re sending messages too quickly. Please wait a moment before trying again.' 
      };
    }

    // Get user to check for connection state
    const user = await userRepo.getUserByPhone(from);
    
    // Check if user is in the middle of connecting their account
    if (user && user.connectionState) {
      console.info('User in connection flow', { from, step: user.connectionState.step });
      
      // Handle cancel command
      if (text.toLowerCase() === 'cancel' || text.toLowerCase() === 'stop') {
        const result = await accountConnectionService.cancelConnection(from);
        return { text: result.message };
      }
      
      // Process the connection input
      const result = await accountConnectionService.handleConnectionInput(from, text);
      
      if (result.message) {
        return { text: result.message };
      }
      
      // If no message but success, fall through to AI to generate response
    }

    // Check if user is confirming a pending transaction
    if (session.pendingTransaction) {
      return await handleTransactionConfirmation(session, text, from);
    }

    // Check if Groq AI is configured
    if (!aiService.isConfigured()) {
      console.warn('Groq API not configured, falling back to basic intent detection');
      return await handleWithBasicIntents(session, text);
    }

    // Get conversation history for context
    const rawHistory = await conversationService.getConversationHistory(from);
    const conversationHistory = conversationService.formatForGroq(rawHistory);

    console.info('Processing with AI', { 
      from: session.from, 
      textLength: text.length,
      historySize: conversationHistory.length 
    });

    // Add user message to history
    await conversationService.addUserMessage(from, text);

    // Process message with AI
    const aiResponse = await aiService.processMessage(text, conversationHistory);

    // Handle based on AI response type
    if (aiResponse.type === 'function_call') {
      return await executeFunctionCall(aiResponse, session, conversationHistory, from);
    }

    // Regular text response
    const responseText = aiResponse.content || "I'm not sure how to help with that.";
    
    // Add assistant response to history
    await conversationService.addAssistantMessage(from, responseText);
    
    return { text: responseText };

  } catch (err) {
    console.error('Error handling webhook event:', {
      error: err.message,
      from: event.from,
      stack: err.stack
    });
    
    if (err.message === 'session_limit_exceeded') {
      return { text: 'Service temporarily unavailable. Please try again later.' };
    }

    if (err.message === 'groq_api_key_invalid') {
      return { text: 'AI service is not configured. Please contact support.' };
    }

    if (err.message === 'groq_rate_limit_exceeded') {
      return { text: 'Service is busy. Please try again in a moment.' };
    }
    
    return { text: 'Sorry, there was an error processing your request. Please try again.' };
  }
}

/**
 * Execute a function call requested by AI
 */
async function executeFunctionCall(aiResponse, session, conversationHistory, phoneNumber) {
  const functionName = aiResponse.function;
  const args = aiResponse.arguments;

  console.info('Executing function call', { function: functionName, args });

  try {
    let result;

    switch (functionName) {
      case 'check_account_status':
        // Check if user has connected their account
        const status = await accountConnectionService.getConnectionStatus(phoneNumber);
        result = {
          connected: status.connected,
          message: status.message,
          accountId: status.accountId || null
        };
        // If the account is connected, attempt to satisfy the user's immediate intent
        // instead of only returning a generic greeting. This avoids the assistant
        // repeatedly replying with "Welcome back!" when the user actually asked
        // for balances or transactions.
        if (result.connected) {
          try {
            const lastUser = (conversationHistory && conversationHistory.length)
              ? (conversationHistory[conversationHistory.length - 1].content || '')
              : '';
            const normalized = String(lastUser).toLowerCase();

            // If the user's last message asked about balance, fetch accounts and
            // generate a balance response.
            if (normalized.includes('balance') || normalized.includes("how much") || normalized.includes("what's my balance") || normalized.includes('what is my balance')) {
              const accounts = await bankService.getAccountsForUser(session.userId);
              if (!accounts || accounts.length === 0) {
                return { text: 'No accounts found. Please contact support.' };
              }

              // Record function result for context and generate natural response
              await conversationService.addFunctionResult(phoneNumber, 'check_account_status', result);
              const resp = await aiService.generateResponseFromFunction('check_balance', { accounts }, conversationHistory);
              await conversationService.addAssistantMessage(phoneNumber, resp);
              return { text: resp };
            }

            // If user asked for transactions, fetch transactions and return
            if (normalized.includes('transaction') || normalized.includes('transactions') || normalized.includes('recent')) {
              const txs = await bankService.getTransactionsForUser(session.userId);
              if (!txs || txs.length === 0) {
                return { text: 'No recent transactions found.' };
              }

              await conversationService.addFunctionResult(phoneNumber, 'check_account_status', result);
              const resp = await aiService.generateResponseFromFunction('get_transactions', { transactions: txs.slice(0, 10) }, conversationHistory);
              await conversationService.addAssistantMessage(phoneNumber, resp);
              return { text: resp };
            }
          } catch (e) {
            console.error('Error auto-handling post-check_account_status intent:', e.message);
            // Fall through to normal behavior (generate greeting)
          }
        }
        break;

      case 'initiate_account_connection':
        // Start the account connection flow
        const connectionResult = await accountConnectionService.initiateConnection(phoneNumber);
        
        if (connectionResult.success || connectionResult.alreadyConnected) {
          return { text: connectionResult.message };
        }
        
        result = connectionResult;
        break;

      case 'check_balance':
        // Check if account is connected first
        const isConnected = await accountConnectionService.isAccountConnected(phoneNumber);
        if (!isConnected) {
          return { 
            text: '🔒 You need to connect your bank account first.\n\nSay "connect account" to get started!' 
          };
        }
        
        const accounts = await bankService.getAccountsForUser(session.userId);
        if (!accounts || accounts.length === 0) {
          return { text: 'No accounts found. Please contact support.' };
        }
        result = { accounts };
        break;

      case 'get_transactions':
        // Check if account is connected first
        if (!await accountConnectionService.isAccountConnected(phoneNumber)) {
          return { 
            text: '🔒 You need to connect your bank account first.\n\nSay "connect account" to get started!' 
          };
        }
        
        const txs = await bankService.getTransactionsForUser(session.userId);
        if (!txs || txs.length === 0) {
          return { text: 'No recent transactions found.' };
        }
        const days = args.days || 7;
        result = { transactions: txs.slice(0, Math.min(days * 2, 20)) }; // Limit results
        break;

      case 'transfer_money':
        // Check if account is connected first
        if (!await accountConnectionService.isAccountConnected(phoneNumber)) {
          return { 
            text: '🔒 You need to connect your bank account first.\n\nSay "connect account" to get started!' 
          };
        }
        
        // This requires confirmation - store as pending
        return await createPendingTransaction(session, functionName, args, phoneNumber);

      case 'get_spending_insights':
        // Check if account is connected first
        if (!await accountConnectionService.isAccountConnected(phoneNumber)) {
          return { 
            text: '🔒 You need to connect your bank account first.\n\nSay "connect account" to get started!' 
          };
        }
        
        // Get transactions and let AI analyze
        const allTxs = await bankService.getTransactionsForUser(session.userId);
        result = { 
          transactions: allTxs.slice(0, 30),
          timeframe: args.timeframe,
          category: args.category
        };
        break;

      default:
        return { text: `Function ${functionName} is not yet implemented.` };
    }

    // Add function result to conversation
    await conversationService.addFunctionResult(phoneNumber, functionName, result);

    console.info('Generating natural language response from function result', {
      function: functionName,
      resultKeys: Object.keys(result || {}),
      phoneNumber
    });

    // Generate natural language response from function result
    // Only include args in history if they exist and are not empty
    const historyWithContext = [...conversationHistory];
    if (args && Object.keys(args).length > 0) {
      historyWithContext.push({ 
        role: 'user', 
        content: `Function arguments: ${JSON.stringify(args)}` 
      });
    }

    const responseText = await aiService.generateResponseFromFunction(
      functionName,
      result,
      historyWithContext
    );

    console.info('Generated response', {
      function: functionName,
      responseLength: responseText.length,
      preview: responseText.substring(0, 50)
    });

    // Add assistant response to history
    await conversationService.addAssistantMessage(phoneNumber, responseText);

    return { text: responseText };

  } catch (error) {
    console.error('Error executing function:', { function: functionName, error: error.message });
    return { text: 'Sorry, I encountered an error executing that action. Please try again.' };
  }
}

/**
 * Create a pending transaction that requires user confirmation
 */
async function createPendingTransaction(session, functionName, args, phoneNumber) {
  const pendingTransaction = {
    type: 'transfer',
    function: functionName,
    arguments: args,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  };

  await sessionRepo.updateSession(phoneNumber, { pendingTransaction });

  const { from_account, to_account, amount } = args;
  const confirmText = `🔒 Confirmation Required\n\nTransfer ₦${amount.toLocaleString()} from ${from_account} to ${to_account}?\n\nReply YES to confirm or NO to cancel.\n\n(Expires in 5 minutes)`;

  return { text: confirmText };
}

/**
 * Handle transaction confirmation (YES/NO)
 */
async function handleTransactionConfirmation(session, text, phoneNumber) {
  const pending = session.pendingTransaction;

  // Check if expired
  if (Date.now() > pending.expiresAt) {
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });
    return { text: 'Transaction confirmation expired. Please try again if you still want to transfer.' };
  }

  const normalized = text.toLowerCase().trim();

  if (normalized === 'yes' || normalized === 'y' || normalized === 'confirm') {
    // Execute the transfer
    const { from_account, to_account, amount } = pending.arguments;
    
    // Clear pending transaction
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });

    // TODO: Implement actual transfer when bank API is connected
    // For now, simulate success
    const responseText = `✅ Transfer Complete!\n\n₦${amount.toLocaleString()} transferred from ${from_account} to ${to_account}.\n\nNew balance will reflect shortly.`;
    
    await conversationService.addAssistantMessage(phoneNumber, responseText);
    
    return { text: responseText };
  }

  if (normalized === 'no' || normalized === 'n' || normalized === 'cancel') {
    // Cancel transaction
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });
    return { text: 'Transfer cancelled. Is there anything else I can help you with?' };
  }

  // Invalid response
  return { text: 'Please reply YES to confirm the transfer or NO to cancel.' };
}

/**
 * Fallback to basic intent detection if AI is not configured
 */
async function handleWithBasicIntents(session, text) {
  const intent = detectIntent(text);
  
  console.info('Intent detected (fallback)', { intent, from: session.from });
  
  switch (intent) {
    case 'balance':
      const accounts = await bankService.getAccountsForUser(session.userId);
      if (!accounts || accounts.length === 0) {
        return { text: 'No accounts found. Please contact support.' };
      }
      const lines = accounts.map(a => `${validator.escape(a.name)}: ₦${a.balance.toLocaleString()}`).join('\n');
      return { text: `You have ${accounts.length} account(s):\n${lines}` };
      
    case 'transactions':
      const txs = await bankService.getTransactionsForUser(session.userId);
      if (!txs || txs.length === 0) {
        return { text: 'No recent transactions found.' };
      }
      const list = txs.slice(0, 5).map(t => 
        `${validator.escape(t.date)} ${validator.escape(t.desc)} ₦${t.amount.toLocaleString()}`
      ).join('\n');
      return { text: `Recent transactions:\n${list}` };
      
    case 'help':
      return { 
        text: "Available commands:\n• 'balance' - Check account balances\n• 'transactions' - View recent transactions\n• 'help' - Show this help\n\n💡 Tip: You can also chat naturally with me!" 
      };
      
    default:
      return { 
        text: "I didn't understand that command. Send 'help' to see available options, or try asking me naturally!" 
      };
  }
}

module.exports = { handleEvent };
