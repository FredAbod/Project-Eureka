/**
 * Web Chat Service
 * Adapts the WhatsApp webhook flow for web clients
 *
 * SECURITY: All operations require authenticated user
 * Minimal data exposure in responses
 */

const aiService = require("./aiService");
const conversationService = require("./conversationService");
const bankService = require("./bankService");
const accountConnectionService = require("./accountConnectionService");
const sessionRepo = require("../repositories/sessionRepository");
const userRepo = require("../repositories/userRepository");
const { logBankingOperation } = require("../middleware/auditLogger");

/**
 * Process a chat message from authenticated web user
 * @param {Object} params - { userId, phoneNumber, message, ip }
 * @returns {Object} Response with AI reply
 */
async function processMessage(params) {
  const { userId, phoneNumber, message, ip } = params;

  try {
    // Get or create session (uses phone number as identifier, same as WhatsApp)
    const session = await sessionRepo.getOrCreate(phoneNumber);

    // Check if user has pending transaction requiring confirmation
    if (session.pendingTransaction) {
      return await handlePendingTransaction(
        session,
        message,
        phoneNumber,
        ip,
        userId,
      );
    }

    // Get conversation history for context
    const rawHistory =
      await conversationService.getConversationHistory(phoneNumber);
    const conversationHistory = conversationService.formatForGroq(rawHistory);

    // Add user message to history
    await conversationService.addUserMessage(phoneNumber, message);

    // Process with AI
    const aiResponse = await aiService.processMessage(
      message,
      conversationHistory,
    );

    // Handle based on response type
    if (aiResponse.type === "function_call") {
      return await executeFunctionCall(
        aiResponse,
        session,
        conversationHistory,
        phoneNumber,
        ip,
        userId, // Pass the real userId from JWT auth
      );
    }

    // Regular text response
    const responseText =
      aiResponse.content || "I'm not sure how to help with that.";
    await conversationService.addAssistantMessage(phoneNumber, responseText);

    return {
      success: true,
      data: {
        response: responseText,
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  } catch (error) {
    console.error("Web chat processing error:", error.message);

    if (error.message === "groq_api_key_invalid") {
      return {
        success: false,
        error: "service_unavailable",
      };
    }

    if (error.message === "groq_rate_limit_exceeded") {
      return {
        success: false,
        error: "service_busy",
      };
    }

    return {
      success: false,
      error: "processing_failed",
    };
  }
}

/**
 * Execute AI function call
 */
async function executeFunctionCall(
  aiResponse,
  session,
  conversationHistory,
  phoneNumber,
  ip,
  userId, // Real userId from JWT auth
) {
  const functionName = aiResponse.function;
  const args = aiResponse.arguments;

  console.info("Web chat executing function", {
    function: functionName,
    args,
    userId,
  });

  try {
    let result;

    switch (functionName) {
      case "check_account_status":
        const status =
          await accountConnectionService.getConnectionStatus(phoneNumber);
        result = {
          connected: status.connected,
          message: status.message,
        };
        break;

      case "initiate_account_connection":
        const connectionResult =
          await accountConnectionService.initiateConnection(phoneNumber);
        // Return connection URL if available
        return {
          success: true,
          data: {
            response: connectionResult.message,
            timestamp: new Date().toISOString(),
            requiresConfirmation: false,
            action: connectionResult.success ? "connection_initiated" : null,
          },
        };

      case "check_balance":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response:
                "You need to connect your bank account first. Would you like to start the connection process?",
              timestamp: new Date().toISOString(),
              requiresConfirmation: false,
              action: "connection_required",
            },
          };
        }
        const accounts = await bankService.getAccountsForUser(userId);
        if (!accounts || accounts.length === 0) {
          return {
            success: true,
            data: {
              response: "No accounts found. Please contact support.",
              timestamp: new Date().toISOString(),
            },
          };
        }
        result = { accounts };

        logBankingOperation({
          userId,
          phoneNumber,
          action: "check_balance",
          status: "success",
          ip,
        });
        break;

      case "get_transactions":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response: "You need to connect your bank account first.",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        const txs = await bankService.getTransactionsForUser(userId);
        if (!txs || txs.length === 0) {
          return {
            success: true,
            data: {
              response: "No recent transactions found.",
              timestamp: new Date().toISOString(),
            },
          };
        }
        result = { transactions: txs.slice(0, 10) };

        logBankingOperation({
          userId,
          phoneNumber,
          action: "get_transactions",
          status: "success",
          ip,
        });
        break;

      case "transfer_money":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response: "You need to connect your bank account first.",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        // Create pending transaction
        return await createPendingTransaction(
          session,
          args,
          phoneNumber,
          ip,
          userId,
        );

      case "get_spending_insights":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response: "You need to connect your bank account first.",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        const allTxs = await bankService.getTransactionsForUser(userId);
        result = {
          transactions: allTxs.slice(0, 30),
          timeframe: args.timeframe,
        };
        break;

      case "get_all_accounts":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response:
                "You need to connect your bank account first. Would you like to start the connection process?",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        const allAccounts = await bankService.getAccountsForUser(userId);
        result = {
          accounts: allAccounts,
          count: allAccounts.length,
        };
        logBankingOperation({
          userId,
          phoneNumber,
          action: "get_all_accounts",
          status: "success",
          ip,
        });
        break;

      case "get_total_balance":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response:
                "You need to connect your bank account first. Would you like to start the connection process?",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        const balanceData = await bankService.getAggregatedBalance(userId);
        result = balanceData;
        logBankingOperation({
          userId,
          phoneNumber,
          action: "get_total_balance",
          status: "success",
          ip,
        });
        break;

      case "lookup_recipient":
        if (!(await accountConnectionService.isAccountConnected(phoneNumber))) {
          return {
            success: true,
            data: {
              response: "You need to connect your bank account first.",
              timestamp: new Date().toISOString(),
              action: "connection_required",
            },
          };
        }
        const bankLookupService = require("./bankLookupService");
        const lookupResult = await bankLookupService.lookupAccount(
          args.account_number,
          args.bank_name,
        );
        result = lookupResult;
        logBankingOperation({
          userId,
          phoneNumber,
          action: "lookup_recipient",
          status: lookupResult.success ? "success" : "failed",
          ip,
          metadata: {
            accountNumber: args.account_number,
            bank: args.bank_name,
          },
        });
        break;

      default:
        return {
          success: true,
          data: {
            response: "I can't perform that action yet.",
            timestamp: new Date().toISOString(),
          },
        };
    }

    // Generate natural language response
    await conversationService.addFunctionResult(
      phoneNumber,
      functionName,
      result,
    );
    const responseText = await aiService.generateResponseFromFunction(
      functionName,
      result,
      conversationHistory,
    );
    await conversationService.addAssistantMessage(phoneNumber, responseText);

    return {
      success: true,
      data: {
        response: responseText,
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  } catch (error) {
    console.error("Function execution error:", error.message);
    return {
      success: false,
      error: "action_failed",
    };
  }
}

/**
 * Create pending transaction requiring confirmation
 */
async function createPendingTransaction(
  session,
  args,
  phoneNumber,
  ip,
  userId,
) {
  const pendingTransaction = {
    type: "transfer",
    arguments: args,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };

  await sessionRepo.updateSession(phoneNumber, { pendingTransaction });

  const {
    recipient_account_number,
    recipient_bank_code,
    recipient_name,
    amount,
    from_account_id,
  } = args;

  // Get bank name from code
  const bankLookupService = require("./bankLookupService");
  const bank = bankLookupService.getBankByCode(recipient_bank_code);
  const bankName = bank ? bank.name : recipient_bank_code;

  logBankingOperation({
    userId,
    phoneNumber,
    action: "transfer_initiated",
    amount,
    status: "pending_confirmation",
    ip,
    metadata: { recipient_account_number, recipient_bank_code, recipient_name },
  });

  // Build confirmation message
  const recipientDisplay =
    recipient_name || `Account ${recipient_account_number}`;
  const confirmMessage = `Transfer ₦${amount.toLocaleString()} to ${recipientDisplay} at ${bankName}? Reply "confirm" or "cancel".`;

  return {
    success: true,
    data: {
      response: confirmMessage,
      timestamp: new Date().toISOString(),
      requiresConfirmation: true,
      pendingAction: {
        type: "transfer",
        amount,
        recipientName: recipient_name,
        recipientAccount: recipient_account_number,
        recipientBank: bankName,
        expiresIn: 300, // 5 minutes
      },
    },
  };
}

/**
 * Handle pending transaction confirmation
 */
async function handlePendingTransaction(
  session,
  text,
  phoneNumber,
  ip,
  userId,
) {
  const pending = session.pendingTransaction;

  // Check if expired
  if (Date.now() > pending.expiresAt) {
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });
    return {
      success: true,
      data: {
        response: "Transaction confirmation expired. Please try again.",
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  }

  const normalized = text.toLowerCase().trim();

  if (normalized === "confirm" || normalized === "yes" || normalized === "y") {
    const {
      recipient_account_number,
      recipient_bank_code,
      recipient_name,
      amount,
    } = pending.arguments;
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });

    // Get bank name from code
    const bankLookupService = require("./bankLookupService");
    const bank = bankLookupService.getBankByCode(recipient_bank_code);
    const bankName = bank ? bank.name : recipient_bank_code;

    // TODO: Execute actual transfer with Mono API
    logBankingOperation({
      userId,
      phoneNumber,
      action: "transfer_completed",
      amount,
      status: "success",
      ip,
      metadata: {
        recipient_account_number,
        recipient_bank_code,
        recipient_name,
      },
    });

    const recipientDisplay =
      recipient_name || `Account ${recipient_account_number}`;
    const responseText = `Transfer complete! ₦${amount.toLocaleString()} sent to ${recipientDisplay} at ${bankName}.`;
    await conversationService.addAssistantMessage(phoneNumber, responseText);

    return {
      success: true,
      data: {
        response: responseText,
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  }

  if (normalized === "cancel" || normalized === "no" || normalized === "n") {
    await sessionRepo.updateSession(phoneNumber, { pendingTransaction: null });

    logBankingOperation({
      userId,
      phoneNumber,
      action: "transfer_cancelled",
      amount: pending.arguments.amount,
      status: "cancelled",
      ip,
    });

    return {
      success: true,
      data: {
        response:
          "Transfer cancelled. Is there anything else I can help you with?",
        timestamp: new Date().toISOString(),
        requiresConfirmation: false,
      },
    };
  }

  // Invalid response
  return {
    success: true,
    data: {
      response:
        'Please reply "confirm" to proceed or "cancel" to cancel the transfer.',
      timestamp: new Date().toISOString(),
      requiresConfirmation: true,
    },
  };
}

/**
 * Get chat history for a user
 * @param {Object} params - { phoneNumber, limit, before }
 * @returns {Object} Chat history with pagination
 */
async function getChatHistory(params) {
  const { phoneNumber, limit = 20, before } = params;

  try {
    // For now, return empty since conversation history is stored in-memory
    // TODO: Persist conversation history to MongoDB for cross-channel sync
    const history =
      await conversationService.getConversationHistory(phoneNumber);

    return {
      success: true,
      data: {
        messages: history.slice(0, limit).map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
        })),
        hasMore: history.length > limit,
        nextCursor: null, // TODO: Implement cursor-based pagination
      },
    };
  } catch (error) {
    console.error("Get chat history error:", error.message);
    return {
      success: false,
      error: "fetch_failed",
    };
  }
}

module.exports = {
  processMessage,
  getChatHistory,
};
