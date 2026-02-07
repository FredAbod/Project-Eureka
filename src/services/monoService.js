/**
 * Mono Service
 * Handles all interactions with Mono API for bank account aggregation
 *
 * Mono Documentation: https://docs.mono.co
 */

// Node.js v18+ has native fetch, no need to require node-fetch

class MonoService {
  constructor() {
    this.secretKey = process.env.MONO_SECRET_KEY;
    this.publicKey = process.env.MONO_PUBLIC_KEY;

    // Mono uses v2 for both sandbox and production
    // Sandbox vs production is determined by the secret key (test_ prefix for sandbox)
    this.baseUrl = process.env.MONO_BASE_URL || "https://api.withmono.com/v2";

    if (!this.secretKey) {
      console.warn("⚠️ MONO_SECRET_KEY not set in environment variables");
    }
    if (!this.publicKey) {
      console.warn("⚠️ MONO_PUBLIC_KEY not set in environment variables");
    }

    const isSandbox = this.secretKey && this.secretKey.startsWith("test_");
    console.log("🔧 Mono Service initialized");
    console.log(
      "   Environment:",
      isSandbox ? "🧪 SANDBOX (test)" : "🚀 PRODUCTION (live)",
    );
    console.log("   Base URL:", this.baseUrl);
    console.log(
      "   Secret Key:",
      this.secretKey ? `${this.secretKey.substring(0, 20)}...` : "NOT SET",
    );
  }

  /**
   * Get authorization headers for Mono API
   */
  getHeaders() {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "mono-sec-key": this.secretKey,
    };
  }

  /**
   * Step 1: Initiate account linking
   * Generate a Connect URL that users can use to link their bank accounts
   *
   * @param {Object} customer - Customer information
   * @param {string} customer.name - Customer's full name
   * @param {string} customer.email - Customer's email
   * @param {string} redirectUrl - URL to redirect after successful linking
   * @param {string} ref - Optional reference ID for tracking
   * @returns {Promise<Object>} - Contains mono_url for account linking
   */
  async initiateAccountLinking(customer, redirectUrl, ref = null) {
    try {
      const payload = {
        customer: {
          name: customer.name,
          email: customer.email,
        },
        scope: "auth",
        redirect_url: redirectUrl,
      };

      if (ref) {
        payload.meta = { ref };
      }

      // Use the correct Mono API endpoint: api.withmono.com/v2/accounts/initiate
      const response = await fetch(`${this.baseUrl}/accounts/initiate`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to initiate account linking");
      }

      // Response structure: { status, message, timestamp, data: { mono_url, customer, meta, ... } }
      const responseData = data.data;
      console.log("✅ Mono Connect URL generated:", responseData.mono_url);

      return {
        success: true,
        monoUrl: responseData.mono_url,
        customerId: responseData.customer,
        ref: responseData.meta?.ref,
      };
    } catch (error) {
      console.error("❌ Error initiating account linking:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Step 2: Exchange authorization code for Account ID
   * After user successfully links account, exchange the temporary code for permanent account ID
   *
   * @param {string} code - Temporary authorization code from Mono Connect
   * @returns {Promise<Object>} - Contains permanent account ID
   */
  async exchangeToken(code) {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/auth`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to exchange token");
      }

      // Response structure: { status, message, timestamp, data: { id } }
      const accountId = data.data?.id || data.id;
      console.log("✅ Account ID obtained:", accountId);

      return {
        success: true,
        accountId: accountId,
      };
    } catch (error) {
      console.error("❌ Error exchanging token:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Step 3: Get account details
   * Fetch detailed information about a linked bank account
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @returns {Promise<Object>} - Account details including balance, account number, etc.
   */
  async getAccountDetails(accountId) {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${accountId}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch account details");
      }

      const account = data.data.account;
      const meta = data.data.meta;

      console.log(
        `✅ Account details retrieved for ${account.institution.name}`,
      );

      return {
        success: true,
        account: {
          id: account.id,
          name: account.name,
          accountNumber: account.account_number,
          currency: account.currency,
          type: account.type,
          balance: account.balance,
          bvn: account.bvn,
          institution: {
            name: account.institution.name,
            bankCode: account.institution.bank_code,
            type: account.institution.type,
          },
        },
        meta: {
          dataStatus: meta.data_status,
          authMethod: meta.auth_method,
          retrievedData: meta.retrieved_data,
        },
      };
    } catch (error) {
      console.error("❌ Error fetching account details:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account balance
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @returns {Promise<Object>} - Current balance
   */
  async getBalance(accountId) {
    try {
      const result = await this.getAccountDetails(accountId);

      if (!result.success) {
        return result;
      }

      return {
        success: true,
        balance: result.account.balance,
        currency: result.account.currency,
      };
    } catch (error) {
      console.error("❌ Error fetching balance:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get transaction history
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @param {Object} options - Query options
   * @param {number} options.page - Page number (default: 1)
   * @param {string} options.start - Start date (YYYY-MM-DD)
   * @param {string} options.end - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} - List of transactions
   */
  async getTransactions(accountId, options = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (options.page) queryParams.append("page", options.page);
      if (options.start) queryParams.append("start", options.start);
      if (options.end) queryParams.append("end", options.end);

      const url = `${this.baseUrl}/accounts/${accountId}/transactions?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch transactions");
      }

      console.log(`✅ Retrieved ${data.data.length} transactions`);

      return {
        success: true,
        transactions: data.data.map((tx) => ({
          id: tx.id,
          narration: tx.narration,
          amount: tx.amount,
          type: tx.type, // 'debit' or 'credit'
          balance: tx.balance,
          date: tx.date,
          category: tx.category,
        })),
        meta: {
          total: data.meta.total,
          page: data.meta.page,
          hasNext: !!data.meta.next,
        },
      };
    } catch (error) {
      console.error("❌ Error fetching transactions:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account statement (PDF)
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @param {Object} options - Statement options
   * @param {string} options.period - Statement period (last1months, last3months, last6months, last12months)
   * @param {string} options.output - Output format (pdf or json)
   * @returns {Promise<Object>} - Statement data or PDF URL
   */
  async getStatement(accountId, options = {}) {
    try {
      const period = options.period || "last3months";
      const output = options.output || "pdf";

      const response = await fetch(
        `${this.baseUrl}/accounts/${accountId}/statement?period=${period}&output=${output}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch statement");
      }

      console.log("✅ Statement retrieved");

      return {
        success: true,
        statement: data.data,
      };
    } catch (error) {
      console.error("❌ Error fetching statement:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account identity information
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @returns {Promise<Object>} - Identity information
   */
  async getIdentity(accountId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${accountId}/identity`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch identity");
      }

      console.log("✅ Identity information retrieved");

      return {
        success: true,
        identity: data.data,
      };
    } catch (error) {
      console.error("❌ Error fetching identity:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Unlink an account
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @returns {Promise<Object>} - Success status
   */
  async unlinkAccount(accountId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${accountId}/unlink`,
        {
          method: "POST",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to unlink account");
      }

      console.log("✅ Account unlinked successfully");

      return {
        success: true,
        message: "Account unlinked successfully",
      };
    } catch (error) {
      console.error("❌ Error unlinking account:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get list of supported banks
   *
   * @returns {Promise<Object>} - List of banks
   */
  async getBanks() {
    try {
      // Mono uses v3 for banks list endpoint (same for sandbox and production)
      const url = `https://api.withmono.com/v3/banks/list`;

      console.log("🔍 Fetching banks from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "mono-sec-key": this.secretKey,
        },
      });

      const contentType = response.headers.get("content-type");
      console.log("📄 Response status:", response.status);
      console.log("📄 Response content-type:", contentType);

      // Get raw text first to see what we're getting
      const rawText = await response.text();
      console.log(
        "📄 Raw response (first 200 chars):",
        rawText.substring(0, 200),
      );

      // If it's not JSON, throw error with helpful message
      if (!contentType || !contentType.includes("application/json")) {
        console.error("❌ Received non-JSON response");
        const isSandbox = this.secretKey && this.secretKey.startsWith("test_");
        throw new Error(
          `API returned ${contentType}. ${isSandbox ? "Using sandbox keys - ensure you're hitting the correct Mono sandbox endpoint." : "Check if MONO_SECRET_KEY is valid."}`,
        );
      }

      // Parse JSON
      const data = JSON.parse(rawText);
      console.log("📦 Response keys:", Object.keys(data));

      if (!response.ok) {
        console.error("❌ API error:", data);
        throw new Error(data.message || `API error: ${response.status}`);
      }

      // Handle both v1 (array) and v2 ({ data: [...] }) formats
      let banks;
      if (Array.isArray(data)) {
        banks = data; // v1 returns array directly
      } else if (data.data && Array.isArray(data.data)) {
        banks = data.data; // v2 returns { data: [...] }
      } else {
        console.error("❌ Unexpected response structure:", data);
        throw new Error("Unexpected API response format");
      }

      console.log(`✅ Retrieved ${banks.length} supported banks`);

      return {
        success: true,
        banks: banks.map((bank) => ({
          id: bank.id || bank._id,
          name: bank.name,
          code: bank.code || bank.bank_code,
          type: bank.type,
          authMethods: bank.auth_methods || [],
        })),
      };
    } catch (error) {
      console.error("❌ Error fetching banks:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sync account data (trigger real-time data refresh)
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @returns {Promise<Object>} - Sync status
   */
  async syncAccount(accountId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${accountId}/sync`,
        {
          method: "POST",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to sync account");
      }

      console.log("✅ Account sync initiated");

      return {
        success: true,
        message: "Account sync initiated",
        code: data.code,
      };
    } catch (error) {
      console.error("❌ Error syncing account:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initiate account reauthorization
   * For accounts that require MFA or have expired credentials
   *
   * @param {string} accountId - Permanent account ID from Mono
   * @param {string} redirectUrl - URL to redirect after reauth
   * @param {string} ref - Optional reference ID
   * @returns {Promise<Object>} - Reauth URL
   */
  async initiateReauth(accountId, redirectUrl, ref = null) {
    try {
      const payload = {
        account: accountId,
        scope: "reauth",
        redirect_url: redirectUrl,
      };

      if (ref) {
        payload.meta = { ref };
      }

      const response = await fetch(`${this.baseUrl}/accounts/initiate`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to initiate reauth");
      }

      console.log("✅ Reauth URL generated:", data.data.mono_url);

      return {
        success: true,
        monoUrl: data.data.mono_url,
      };
    } catch (error) {
      console.error("❌ Error initiating reauth:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initiate a one-time payment
   * Generates a payment link for customers to complete payment
   *
   * @param {Object} options - Payment options
   * @param {number} options.amount - Amount in kobo (e.g., 20000 = ₦200)
   * @param {string} options.type - Payment type: 'onetime-debit'
   * @param {string} options.method - Payment method: 'account', 'transfer', or 'whatsapp'
   * @param {string} options.account - Account ID (for account method)
   * @param {string} options.description - Payment description
   * @param {string} options.reference - Unique payment reference
   * @param {string} options.redirectUrl - URL to redirect after payment
   * @param {Object} options.customer - Customer information
   * @param {string} options.customer.name - Customer name
   * @param {string} options.customer.email - Customer email
   * @param {string} options.customer.phone - Customer phone
   * @param {string} options.customer.address - Customer address (optional)
   * @param {Object} options.customer.identity - Customer identity (optional)
   * @param {Object} options.meta - Additional metadata (optional)
   * @param {Object} options.split - Split payment configuration (optional)
   * @returns {Promise<Object>} - Contains payment_link for completing payment
   */
  async initiatePayment(options) {
    try {
      const {
        amount,
        type = "onetime-debit",
        method = "account",
        account,
        description,
        reference,
        redirectUrl,
        customer,
        meta = {},
        split,
      } = options;

      if (!amount || !reference || !customer) {
        throw new Error("Amount, reference, and customer are required");
      }

      const payload = {
        amount,
        type,
        method,
        description,
        reference,
        redirect_url: redirectUrl,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
        meta,
      };

      // Add account if using account method
      if (method === "account" && account) {
        payload.account = account;
      }

      // Add optional customer fields
      if (customer.address) {
        payload.customer.address = customer.address;
      }
      if (customer.identity) {
        payload.customer.identity = customer.identity;
      }

      // Add split payment configuration if provided
      if (split) {
        payload.split = split;
      }

      const response = await fetch(`${this.baseUrl}/payments/initiate`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to initiate payment");
      }

      console.log("✅ Payment initiated, reference:", reference);

      return {
        success: true,
        paymentLink: data.data?.payment_link || data.payment_link,
        reference: reference,
        data: data.data || data,
      };
    } catch (error) {
      console.error("❌ Error initiating payment:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify payment status
   * Check the status of a payment using its reference
   *
   * @param {string} reference - Payment reference used during initiation
   * @returns {Promise<Object>} - Payment status and details
   */
  async verifyPayment(reference) {
    try {
      if (!reference) {
        throw new Error("Payment reference is required");
      }

      const response = await fetch(
        `${this.baseUrl}/payments/verify/${reference}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to verify payment");
      }

      console.log(
        "✅ Payment verified, status:",
        data.data?.status || data.status,
      );

      return {
        success: true,
        status: data.data?.status || data.status,
        amount: data.data?.amount || data.amount,
        reference: reference,
        data: data.data || data,
      };
    } catch (error) {
      console.error("❌ Error verifying payment:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Lookup bank account to verify recipient before transfer
   * Uses Mono DirectPay account lookup
   *
   * @param {string} accountNumber - 10-digit account number
   * @param {string} bankCode - Bank code
   * @returns {Promise<Object>} - Account holder name
   */
  async lookupBankAccount(accountNumber, bankCode) {
    try {
      // Mono DirectPay lookup endpoint
      const response = await fetch(`${this.baseUrl}/lookup/account`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          account_number: accountNumber,
          bank_code: bankCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.warn("❌ Mono Lookup API Error:", {
          status: response.status,
          statusText: response.statusText,
          data: data,
        });
        return {
          success: false,
          error: data.message || "Account lookup failed",
        };
      }

      console.log("✅ Account lookup successful:", data.data?.account_name);

      return {
        success: true,
        accountName: data.data?.account_name || data.account_name,
        bvn: data.data?.bvn, // Partial BVN if returned
      };
    } catch (error) {
      console.error("❌ Error looking up account:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ===== DIRECT DEBIT (PAYMENTS v3) =====

  /**
   * Get headers for v3 Payments API
   */
  getV3Headers() {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "mono-sec-key": this.secretKey,
    };
  }

  /**
   * Create a Variable Direct Debit Mandate
   * This allows debiting the user's account on-demand
   *
   * @param {Object} options - Mandate options
   * @param {string} options.accountId - Mono account ID of the user
   * @param {string} options.reference - Unique reference for this mandate
   * @param {string} options.description - Description of the mandate
   * @returns {Promise<Object>} - Mandate details
   */
  async createMandate(options) {
    try {
      const { accountId, reference, description } = options;

      const response = await fetch(
        "https://api.withmono.com/v3/payments/mandates",
        {
          method: "POST",
          headers: this.getV3Headers(),
          body: JSON.stringify({
            debit_type: "variable",
            account: accountId,
            reference: reference,
            description: description || "Eureka AI Transfer Mandate",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.warn("❌ Mandate creation failed:", data.message);
        return {
          success: false,
          error: data.message || "Failed to create mandate",
        };
      }

      console.log("✅ Mandate created:", data.data?.id);

      return {
        success: true,
        mandateId: data.data?.id,
        status: data.data?.status,
        readyToDebit: data.data?.ready_to_debit || false,
        data: data.data,
      };
    } catch (error) {
      console.error("❌ Error creating mandate:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get mandate details and status
   *
   * @param {string} mandateId - Mandate ID (starts with mmc_)
   * @returns {Promise<Object>} - Mandate details
   */
  async getMandate(mandateId) {
    try {
      const response = await fetch(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}`,
        {
          method: "GET",
          headers: this.getV3Headers(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || "Failed to get mandate",
        };
      }

      return {
        success: true,
        mandateId: data.data?.id,
        status: data.data?.status,
        readyToDebit: data.data?.ready_to_debit || false,
        data: data.data,
      };
    } catch (error) {
      console.error("❌ Error getting mandate:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if account has sufficient balance for debit
   * This costs NGN 10-50 depending on query type
   *
   * @param {string} mandateId - Mandate ID
   * @param {number} amount - Amount in Kobo (optional - if provided, checks sufficiency)
   * @returns {Promise<Object>} - Balance info
   */
  async checkMandateBalance(mandateId, amount = null) {
    try {
      let url = `https://api.withmono.com/v3/payments/mandates/${mandateId}/balance-inquiry`;
      if (amount) {
        url += `?amount=${amount}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: this.getV3Headers(),
      });

      const data = await response.json();

      if (!response.ok) {
        console.warn("❌ Balance inquiry failed:", data.message);
        return {
          success: false,
          error: data.message || "Balance inquiry failed",
        };
      }

      console.log("✅ Balance inquiry successful:", data.data);

      return {
        success: true,
        hasSufficientBalance: data.data?.has_sufficient_balance,
        accountBalance: data.data?.account_balance,
        accountDetails: data.data?.account_details,
      };
    } catch (error) {
      console.error("❌ Error checking balance:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Debit user's account and send to beneficiary
   * This is the core transfer function
   *
   * @param {Object} options - Debit options
   * @param {string} options.mandateId - Mandate ID (starts with mmc_)
   * @param {number} options.amount - Amount in Kobo (e.g., 100000 = ₦1,000)
   * @param {string} options.reference - Unique reference for this transaction
   * @param {string} options.narration - Transaction description
   * @param {Object} options.beneficiary - Recipient details
   * @param {string} options.beneficiary.nuban - Recipient account number
   * @param {string} options.beneficiary.nipCode - Recipient bank NIP code
   * @param {string} options.feeBearer - 'business' or 'customer' (default: business)
   * @returns {Promise<Object>} - Transaction result
   */
  async debitWithBeneficiary(options) {
    try {
      const {
        mandateId,
        amount,
        reference,
        narration,
        beneficiary,
        feeBearer = "business",
      } = options;

      const payload = {
        amount: amount, // in Kobo
        reference: reference,
        narration: narration || "Transfer via Eureka AI",
        fee_bearer: feeBearer,
      };

      // Add beneficiary if provided (requires Mono approval)
      if (beneficiary) {
        payload.beneficiary = {
          nuban: beneficiary.nuban,
          nip_code: beneficiary.nipCode,
        };
      }

      const response = await fetch(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}/debit`,
        {
          method: "POST",
          headers: this.getV3Headers(),
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.warn("❌ Debit failed:", data.message, data.response_code);
        return {
          success: false,
          error: data.message || "Debit failed",
          responseCode: data.response_code,
        };
      }

      console.log("✅ Debit successful:", data.data);

      return {
        success: true,
        status: data.data?.status,
        amount: data.data?.amount,
        reference: data.data?.reference_number,
        fee: data.data?.fee,
        sessionId: data.data?.session_id,
        accountDetails: data.data?.account_details,
        beneficiary: data.data?.beneficiary,
        data: data.data,
      };
    } catch (error) {
      console.error("❌ Error debiting account:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Direct Payout (alternative to Direct Debit)
   * Sends money directly without mandate - simpler flow
   *
   * @param {Object} options - Payout options
   * @param {number} options.amount - Amount in Kobo
   * @param {string} options.accountNumber - Recipient account number
   * @param {string} options.bankCode - Recipient bank code
   * @param {string} options.reference - Unique reference
   * @param {string} options.narration - Description
   * @returns {Promise<Object>} - Payout result
   */
  async initiatePayout(options) {
    try {
      const { amount, accountNumber, bankCode, reference, narration } = options;

      const response = await fetch(
        "https://api.withmono.com/v2/payments/initiate",
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            amount: amount,
            type: "onetime-debit",
            method: "direct-debit",
            description: narration || "Payout via Eureka AI",
            reference: reference,
            account: {
              account_number: accountNumber,
              bank_code: bankCode,
            },
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.warn("❌ Payout initiation failed:", data.message);
        return {
          success: false,
          error: data.message || "Payout failed",
        };
      }

      console.log("✅ Payout initiated:", data.data);

      return {
        success: true,
        paymentId: data.data?.id,
        paymentLink: data.data?.payment_link,
        status: data.data?.status,
        data: data.data,
      };
    } catch (error) {
      console.error("❌ Error initiating payout:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new MonoService();
