const monoClient = require("./client");

/**
 * Mono Mandates Service
 * Handles recurring debits and variable mandates.
 */
class MonoMandatesService {
  /**
   * Initiate Mandate (Step 1: Get Widget Link)
   * POST /v2/payments/initiate
   * @param {Object} options
   * @param {number} options.amount - Total amount for the mandate period
   * @param {string} options.customerId - Mono customer ID
   * @param {string} options.description - Mandate description
   * @param {string} options.reference - Unique reference
   * @param {string} options.redirectUrl - Redirect URL after mandate setup
   * @param {string} options.mandateType - "emandate" | "signed" | "gsm"
   * @param {string} options.debitType - "variable" | "fixed"
   */
  async initiateMandate(options) {
    try {
      const {
        amount,
        customerId,
        description,
        reference,
        redirectUrl,
        mandateType = "emandate",
        debitType = "variable",
      } = options;

      if (!customerId) {
        throw new Error("Mono customer ID is required to initiate a mandate");
      }

      // For variable mandates, amount = total collection cap over the period.
      // Mono rejects amount: 0; use a reasonable default (₦500,000 = 50000000 kobo).
      const mandateAmount = amount || 50000000;

      // Mono requires reference to be alphanumeric only (no underscores/hyphens)
      const safeReference = (reference || `ref${Date.now()}`).replace(
        /[^a-zA-Z0-9]/g,
        "",
      );

      const payload = {
        amount: mandateAmount,
        type: "recurring-debit",
        method: "mandate",
        mandate_type: mandateType,
        debit_type: debitType,
        description: description || "Eureka AI Mandate Setup",
        reference: safeReference,
        redirect_url:
          redirectUrl ||
          process.env.MONO_REDIRECT_URL ||
          "http://localhost:3000/chat",
        customer: { id: customerId },
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        meta: { source: "eureka" },
      };

      console.log("📤 Mandate initiation payload:", JSON.stringify(payload, null, 2));

      const data = await monoClient.request("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Mono v2 payments/initiate returns the mandate link as data.data.mono_url
      const paymentLink =
        data.data?.mono_url ||
        data.payment_link ||
        data.link ||
        data.data?.payment_link ||
        data.data?.link ||
        data.data?.payment_page_url;

      if (!paymentLink) {
        console.warn(
          "⚠️ Mandate response missing payment_link. Keys:",
          Object.keys(data),
          data.data ? Object.keys(data.data) : [],
        );
      } else {
        console.log("✅ Mandate initiated, reference:", payload.reference);
      }

      return {
        success: true,
        payment_link: paymentLink,
        reference: data.reference || data.data?.reference || payload.reference,
      };
    } catch (error) {
      console.error("❌ Mandate initiation failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Mandate (V3)
   * POST /v3/payments/mandates
   * @param {Object} options
   * @param {string} options.customerId - Mono customer ID (required)
   * @param {string} options.accountNumber - Bank account number
   * @param {string} options.bankCode - Bank NIP code
   * @param {string} options.reference - Unique reference
   * @param {string} options.description - Mandate description
   * @param {number} options.amount - Mandate amount
   * @param {string} options.debitType - "variable" | "fixed"
   * @param {string} options.mandateType - Mandate type
   * @param {string} options.feeBearer - "customer" | "business"
   */
  async createMandate(options) {
    try {
      const {
        customerId,
        accountNumber,
        bankCode,
        reference,
        description,
        amount = 0,
        debitType = "variable",
        mandateType = "emandate",
        feeBearer = "business",
      } = options;

      if (!customerId) {
        throw new Error("Mono customer ID is required to create a mandate");
      }

      const safeReference = (reference || `mandate${Date.now()}`).replace(
        /[^a-zA-Z0-9]/g,
        "",
      );

      const payload = {
        debit_type: debitType,
        customer: customerId,
        mandate_type: mandateType,
        amount,
        reference: safeReference,
        description: description || "Eureka AI Transfer Mandate",
        fee_bearer: feeBearer,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        meta: { source: "eureka" },
      };

      if (accountNumber) payload.account_number = accountNumber;
      if (bankCode) payload.bank_code = bankCode;

      const data = await monoClient.request(
        "https://api.withmono.com/v3/payments/mandates",
        {
          method: "POST",
          headers: monoClient.getV3Headers(),
          body: JSON.stringify(payload),
        },
      );

      console.log("✅ Mandate created:", data.data?.id);

      return {
        success: true,
        mandateId: data.data?.id,
        status: data.data?.status,
        readyToDebit: data.data?.ready_to_debit || false,
        data: data.data,
      };
    } catch (error) {
      console.error("❌ Create mandate failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify Mandate Balance
   * @param {string} mandateId
   * @param {number} amount
   */
  async verifyMandateBalance(mandateId, amount) {
    try {
      let endpoint = `/payments/mandates/${mandateId}/balance-inquiry`;
      if (amount) endpoint += `?amount=${amount}`;

      // This endpoint behaves like V3
      const headers = monoClient.getV3Headers();
      // Using generic request but overriding headers if needed,
      // or we can assumes /payments paths use V3?
      // Mono V2/V3 mix is tricky. Usually /v3/ prefix is needed for the URL.
      // My client uses baseUrl which is v2.
      // I need to handle absolute URLs or override base url in client.

      // FIX: The client uses `/v2` base URL.
      // Mandate endpoints are often V3 in documentation but some work on v2?
      // "https://api.withmono.com/v3/payments/mandates"

      // I'll use full URL for fetch in client request if it starts with http
      // implementation details: Client request handles `endpoint`.
      // If I pass a full URL to `fetch`, it works.
      // But `client.request` prepends `baseUrl`.

      // I should overload client to handle full URLs or add a switch.
      // For now, I'll pass the relative path if it works, or modify client.
      // The original code used full https://api.withmono.com/v3/...

      // I will assume client needs an update to handle v3 or I pass full URL and client logic needs to not prepend.
      // Let's modify client logic in my mind:
      // const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

      // I'll write the raw fetch here to be safe or update client.js?
      // Updating `client.js` is better SOLID. I'll do that next.
      // For now, I will assume I'll fix client.js.

      const data = await monoClient.request(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}/balance-inquiry${amount ? `?amount=${amount}` : ""}`,
        {
          method: "GET",
          headers: monoClient.getV3Headers(),
        },
      );

      return {
        success: true,
        hasSufficientBalance: data.data?.has_sufficient_balance,
        accountBalance: data.data?.account_balance,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Debit Mandate
   * @param {string} mandateId
   * @param {number} amount
   * @param {string} reference
   * @param {string} narration
   * @param {Object} beneficiary
   */
  async debitMandate(mandateId, amount, reference, narration, beneficiary) {
    try {
      const payload = {
        amount,
        reference,
        narration: narration || "Transfer",
        fee_bearer: "customer",
      };

      if (beneficiary) {
        payload.beneficiary = {
          nuban: beneficiary.accountNumber || beneficiary.nuban,
          nip_code: beneficiary.bankCode || beneficiary.nipCode,
        };
      }

      const data = await monoClient.request(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}/debit`,
        {
          method: "POST",
          headers: monoClient.getV3Headers(),
          body: JSON.stringify(payload),
        },
      );

      console.log("✅ Debit initiated:", data.data?.reference);

      return {
        success: true,
        status: data.data?.status,
        reference: data.data?.reference,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get mandate details
   * @param {string} mandateId
   */
  async getMandate(mandateId) {
    try {
      const data = await monoClient.request(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}`,
        {
          method: "GET",
          headers: monoClient.getV3Headers(),
        },
      );

      return {
        success: true,
        mandateId: data.data?.id,
        status: data.data?.status,
        readyToDebit: data.data?.ready_to_debit || false,
        data: data.data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check mandate balance (alias/detailed version)
   * @param {string} mandateId
   * @param {number} amount
   */
  async checkMandateBalance(mandateId, amount = null) {
    try {
      const data = await monoClient.request(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}/balance-inquiry${amount ? `?amount=${amount}` : ""}`,
        {
          method: "GET",
          headers: monoClient.getV3Headers(),
        },
      );

      return {
        success: true,
        hasSufficientBalance: data.data?.has_sufficient_balance,
        accountBalance: data.data?.account_balance,
        accountDetails: data.data?.account_details,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Debit with beneficiary (V3)
   * @param {Object} options
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
        amount,
        reference,
        narration: narration || "Transfer via Eureka AI",
        fee_bearer: feeBearer,
      };

      if (beneficiary) {
        payload.beneficiary = {
          nuban: beneficiary.nuban,
          nip_code: beneficiary.nipCode,
        };
      }

      const data = await monoClient.request(
        `https://api.withmono.com/v3/payments/mandates/${mandateId}/debit`,
        {
          method: "POST",
          headers: monoClient.getV3Headers(),
          body: JSON.stringify(payload),
        },
      );

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
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MonoMandatesService();
