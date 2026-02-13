const Groq = require("groq-sdk");
const { z } = require("zod");

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy_key_to_prevent_crash",
});

// Define banking function schemas
const bankingTools = [
  {
    type: "function",
    function: {
      name: "check_account_status",
      description:
        "Check if user has connected their bank account. Call this FIRST before trying any banking operations.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "initiate_account_connection",
      description:
        "Start the process of connecting user's bank account. Use this when user wants to connect their account or when they need to connect before using banking features.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_accounts",
      description:
        "Get list of all connected bank accounts with their individual balances. Use when user asks to see their accounts or wants to know which banks are connected.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_total_balance",
      description:
        "Get the combined total balance across ALL connected bank accounts. Returns both Kobo (balance) and Naira (totalBalanceNaira) values. ALWAYS use the Naira value for display.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_balance",
      description:
        "Get the current balance of user bank accounts. Only works if account is connected.",
      parameters: {
        type: "object",
        properties: {
          account_type: {
            type: "string",
            description: "The type of account (checking, savings, or all)",
            enum: ["checking", "savings", "all"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transactions",
      description:
        "Retrieve recent transaction history for an account. Only works if account is connected.",
      parameters: {
        type: "object",
        properties: {
          account: {
            type: "string",
            description: "Account type (checking, savings, or all)",
            enum: ["checking", "savings", "all"],
          },
          days: {
            type: "number",
            description: "Number of days to look back (default: 7)",
            minimum: 1,
            maximum: 90,
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_recipient",
      description:
        "Verify a recipient's bank account before transfer. ALWAYS call this before initiating a transfer to verify the account holder's name. Requires account number and bank name.",
      parameters: {
        type: "object",
        properties: {
          account_number: {
            type: "string",
            description: "The 10-digit Nigerian bank account number",
          },
          bank_name: {
            type: "string",
            description:
              "Name of the bank (e.g., 'Access Bank', 'GTBank', 'Zenith')",
          },
        },
        required: ["account_number", "bank_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_money",
      description:
        "Transfer money to a verified recipient (requires confirmation). Call lookup_recipient first to verify the account.",
      parameters: {
        type: "object",
        properties: {
          from_account_id: {
            type: "string",
            description:
              "ID of the source account (from user's linked accounts)",
          },
          recipient_account_number: {
            type: "string",
            description: "Recipient's 10-digit account number",
          },
          recipient_bank_code: {
            type: "string",
            description: "Recipient's bank code",
          },
          recipient_name: {
            type: "string",
            description: "Verified recipient name from lookup",
          },
          amount: {
            type: "number",
            description: "Amount to transfer in Naira",
            minimum: 100,
          },
        },
        required: ["recipient_account_number", "recipient_bank_code", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_insights",
      description:
        "Analyze spending patterns and provide insights. Only works if account is connected.",
      parameters: {
        type: "object",
        properties: {
          timeframe: {
            type: "string",
            description: "Time period for analysis",
            enum: ["week", "month", "year"],
          },
          category: {
            type: "string",
            description: "Spending category to analyze (optional)",
          },
        },
        required: ["timeframe"],
      },
    },
  },
];

// System prompt for the banking assistant
const SYSTEM_PROMPT = `You are Eureka AI, a warm and professional banking assistant for Eureka, a leading Nigerian fintech platform. You help users manage their accounts and finances via WhatsApp and Web.

CRITICAL - Function Calling Rules:
- You have access to tools/functions. USE THEM when needed.
- Call functions directly using the provided tool definitions.
- If a user says "yes", "ok", or agrees to something you just proposed, EXECUTE THE CORRESPONDING FUNCTION immediately.
- Do not describe the function call to the user, just output the tool call.

Account Connection Flow:
- When a user first starts talking to you, if you don't know their status, call check_account_status.
- If they ARE NOT connected:
  1. Greet them warmly and explain Eureka helps them track spending and manage banks in one place.
  2. Ask if they would like to connect their bank account now to see their balance.
  3. IF THEY AGREE (e.g., "yes", "sure", "ok"), call initiate_account_connection IMMEDIATELY. Do not ask for confirmation again.
- If they ARE connected:
  1. Greet them as a returning user.
  2. Ask how you can help with their finances today.

Conversational Memory:
- ALWAYS check the conversation history. If you just asked "Ready to connect?" and the user says "yes", you MUST call initiate_account_connection.
- Do NOT repeat greetings or introductory explanations if history shows you already said them.

Your capabilities:
- Check account statuses and link bank accounts via Mono.
- View individual account balances OR total balance across ALL connected accounts (use get_total_balance).
- List all connected accounts (use get_all_accounts).
- View transaction history.
- Categorize spending and provide financial insights.
- Transfer money to other bank accounts.
- Answer questions about banking features.

Transfer Flow - CRITICAL:
- When a user says "transfer X to [account] [bank]", you MUST:
  1. FIRST call lookup_recipient with the account_number and bank_name to verify the recipient
  2. The lookup will return the verified recipient name (e.g., "Fredrick Abodunrin")
  3. Then call transfer_money with the verified details
- NEVER transfer without verifying the recipient first
- If user doesn't provide account number, ask for it
- If user doesn't provide bank name, ask for it
- Support bank name aliases like "GTB" for "Guaranty Trust Bank", "First Bank" for "First Bank of Nigeria"

Multi-Account Support:
- Users can connect MULTIPLE bank accounts (e.g., GTBank, Access, Zenith)
- When user asks "what's my balance", show TOTAL across all accounts using get_total_balance
- When user asks "list my accounts" or "show all accounts", use get_all_accounts
- Clearly show which bank each balance belongs to

Tone and Style:
- Professional yet warm and helpful.
- Use Nigerian Naira (₦) for all amounts.
- IMPORTANT: The banking system returns balances in KOBO (e.g., 10000 = ₦100).
- ALWAYS check for 'balanceNaira' or 'totalBalanceNaira' fields in the function result.
- If 'balanceNaira' is not available, YOU MUST DIVIDE THE RAW BALANCE BY 100 before displaying it.
- Never display the raw Kobo value as Naira.
- Keep messages concise (2-4 lines).
- Never make up data - use functions for real details.`;

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
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    console.info("Calling Groq AI", {
      messageLength: userMessage.length,
      historyLength: conversationHistory.length,
    });

    // Call Groq with function calling enabled
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Fast and accurate
      messages: messages,
      tools: bankingTools,
      tool_choice: "auto", // Let AI decide when to use functions
      temperature: 0.7,
      max_tokens: 500,
    });

    const choice = response.choices[0];

    // Check if AI wants to call a function
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.info("AI requested function call", {
        function: functionName,
        args: functionArgs,
      });

      return {
        type: "function_call",
        function: functionName,
        arguments: functionArgs,
        rawResponse: choice.message,
      };
    }

    // Regular text response (no function call)
    console.info("AI returned text response", {
      length: choice.message.content?.length || 0,
    });

    return {
      type: "text",
      content: choice.message.content,
      rawResponse: choice.message,
    };
  } catch (error) {
    console.error("Groq AI error:", {
      error: error.message,
      code: error.code,
      status: error.status,
    });

    // Fallback to basic intent detection if AI fails
    if (error.status === 401) {
      throw new Error("groq_api_key_invalid");
    }

    if (error.status === 429) {
      throw new Error("groq_rate_limit_exceeded");
    }

    throw new Error("groq_api_error");
  }
}

/**
 * Generate a natural language response after executing a function
 * @param {string} functionName - Name of the function that was executed
 * @param {Object} functionResult - Result from the function execution
 * @param {Array} conversationHistory - Conversation context
 * @returns {Promise<string>} - Natural language response
 */
async function generateResponseFromFunction(
  functionName,
  functionResult,
  conversationHistory = [],
) {
  try {
    // Create a system message that includes the function result
    // This is more compatible with Groq's API than using role: 'function'
    // Use role 'function' for function outputs so the model treats it like a function
    // response and can generate a natural follow-up. Keep the instruction to not
    // mention the function call in the assistant-facing reply.
    const functionResultMessage = {
      role: "function",
      name: functionName,
      content: JSON.stringify(functionResult),
    };

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory,
      functionResultMessage,
    ];

    console.info("Generating response from function result", {
      function: functionName,
      resultPreview: JSON.stringify(functionResult).substring(0, 100),
    });

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      temperature: 0.7,
      max_tokens: 400,
    });

    const generatedResponse = response.choices[0].message.content;
    console.info("Generated response from function", {
      function: functionName,
      responseLength: generatedResponse.length,
    });

    return generatedResponse;
  } catch (error) {
    console.error("Error generating response from function:", {
      function: functionName,
      error: error.message,
      status: error.status,
      result: functionResult,
    });

    // Fallback to basic formatting if AI fails
    if (functionName === "check_balance") {
      const accounts = functionResult.accounts || [];
      const lines = accounts
        .map((a) => {
          const amount =
            a.balanceNaira !== undefined ? a.balanceNaira : a.balance / 100;
          return `${a.name}: ₦${amount.toLocaleString()}`;
        })
        .join("\n");
      return `Your account balances:\n${lines}`;
    }

    if (functionName === "check_account_status") {
      if (functionResult.connected) {
        return "Welcome back! 👋 Your account is connected and ready. How can I help you today?";
      } else {
        return 'Hi there! 👋 Welcome!\n\nTo use banking features, you\'ll need to connect your bank account first.\n\nSay "connect account" to get started!';
      }
    }

    if (functionName === "get_transactions") {
      const txs = functionResult.transactions || [];
      if (txs.length === 0) return "No recent transactions found.";
      const list = txs
        .slice(0, 5)
        .map((t) => `${t.date} - ${t.desc}: ₦${t.amount.toLocaleString()}`)
        .join("\n");
      return `Recent transactions:\n${list}`;
    }

    return "I completed that action successfully.";
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
  return bankingTools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
  }));
}

module.exports = {
  processMessage,
  generateResponseFromFunction,
  isConfigured,
  getAvailableFunctions,
  bankingTools,
};
