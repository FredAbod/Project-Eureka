const monoClient = require("./client");

/**
 * Mono Mandates Service
 * Handles recurring debits and variable mandates.
 */
class MonoMandatesService {
  /**
   * Initiate Mandate (Step 1: Get Widget Link)
   * @param {Object} options
   */
  async initiateMandate(options) {
    try {
      const { amount, description, email, phone, reference } = options;

      const payload = {
        type: "recurring-debit",
        debit_type: "variable", // Required for recurring setup
        amount: amount || 0,
        description: description || "Eureka AI Mandate Setup",
        currency: "NGN",
        reference: reference || `ref_${Date.now()}`, // Fallback
        customer: { email, phone },
      };

      const data = await monoClient.request("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        payment_link: data.payment_link || data.data?.link,
        reference: data.reference || data.data?.reference,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Mandate (V3)
   * @param {Object} options
   */
  async createMandate(options) {
    try {
      const { accountId, customerId, reference, description } = options;

      const payload = {
        debit_type: "variable",
        account: accountId,
        reference,
        description: description || "Eureka AI Transfer Mandate",
      };

      if (customerId) payload.customer = customerId;

      const data = await monoClient.request("/payments/mandates", {
        method: "POST",
        headers: monoClient.getV3Headers(), // Use V3 Headers
        body: JSON.stringify(payload),
      });

      console.log("✅ Mandate created:", data.data?.id);

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
