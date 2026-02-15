/**
 * Banking Tool Definitions
 * Schemas for banking-related functions used by the AI
 */
const getBankingTools = () => [
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
        "Verify a recipient's bank account before transfer. ALWAYS call this before initiating a transfer to verify the account holder's name. Requires account number and bank name. IF VERIFICATION FAILS, DO NOT ask for the bank name again if it was already provided. Instead, report the error to the user.",
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
          from_account_id: {
            type: "string",
            description:
              "Optional: The internal ID of the source account to debit. Use if user specifies a particular account (e.g. 'from opay').",
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

module.exports = { getBankingTools };
