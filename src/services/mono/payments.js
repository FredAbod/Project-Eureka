const monoClient = require("./client");

/**
 * Mono Payments Service
 * Handles one-time payments and payouts.
 */
class MonoPaymentsService {
  /**
   * Initiate a one-time payment
   * @param {Object} options
   */
  async initiatePayment(options) {
    try {
      const {
        amount,
        type = "onetime-debit",
        method = "account",
        reference,
        redirectUrl,
        customer,
      } = options;

      if (!amount || !reference || !customer) {
        throw new Error("Amount, reference, and customer are required");
      }

      const payload = {
        amount,
        type,
        method,
        reference,
        redirect_url: redirectUrl,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
        ...options, // Spread other options like meta, split, account
      };

      const data = await monoClient.request("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      console.log("✅ Payment initiated, reference:", reference);

      return {
        success: true,
        paymentLink: data.data?.payment_link || data.payment_link,
        reference: reference,
        data: data.data || data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify payment status
   * @param {string} reference
   */
  async verifyPayment(reference) {
    try {
      if (!reference) throw new Error("Payment reference is required");

      const data = await monoClient.request(`/payments/verify/${reference}`, {
        method: "GET",
      });

      return {
        success: true,
        status: data.data?.status || data.status,
        amount: data.data?.amount || data.amount,
        reference: reference,
        data: data.data || data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Initiate Payout (Direct transfer)
   * @param {Object} options
   */
  async initiatePayout(options) {
    try {
      const { amount, accountNumber, bankCode, reference, narration } = options;

      const payload = {
        amount,
        type: "onetime-debit",
        method: "direct-debit",
        description: narration || "Payout via Eureka AI",
        reference,
        account: {
          account_number: accountNumber,
          bank_code: bankCode,
        },
      };

      const data = await monoClient.request("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      console.log("✅ Payout initiated:", data.data);

      return {
        success: true,
        paymentId: data.data?.id,
        paymentLink: data.data?.payment_link,
        status: data.data?.status,
        data: data.data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MonoPaymentsService();
