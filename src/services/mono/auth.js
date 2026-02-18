const monoClient = require("./client");

/**
 * Mono Authentication Service
 * Handles account linking and token exchange.
 */
class MonoAuthService {
  /**
   * Initiate account linking
   * @param {Object} customer - { name, email, phone, address }
   * @param {string} redirectUrl
   * @param {string} ref - Optional reference
   */
  async initiateAccountLinking(customer, redirectUrl, ref = null) {
    try {
      const customerPayload = {
        name: customer.name,
        email: customer.email,
      };

      // Mono requires phone and address for mandate creation
      if (customer.phone) {
        customerPayload.phone = customer.phone;
      }
      if (customer.address) {
        customerPayload.address = customer.address;
      }

      const payload = {
        customer: customerPayload,
        scope: "auth",
        redirect_url: redirectUrl,
      };

      if (ref) payload.meta = { ref };

      const data = await monoClient.request("/accounts/initiate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      console.log("✅ Mono Connect URL generated:", data.data.mono_url);

      return {
        success: true,
        monoUrl: data.data.mono_url,
        customerId: data.data.customer,
        ref: data.data.meta?.ref,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Exchange authorization code for Account ID
   * @param {string} code
   */
  async exchangeToken(code) {
    try {
      const data = await monoClient.request("/accounts/auth", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      const accountId = data.data?.id || data.id;
      console.log("✅ Account ID obtained:", accountId);

      return { success: true, accountId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Initiate account reauthorization
   * @param {string} accountId
   * @param {string} redirectUrl
   * @param {string} ref
   */
  async initiateReauth(accountId, redirectUrl, ref = null) {
    try {
      const payload = {
        scope: "auth", // Or scope depending on need
        redirect_url: redirectUrl,
      };
      if (ref) payload.meta = { ref };

      const data = await monoClient.request(
        `/accounts/${accountId}/reauthorise`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      console.log("✅ Mono Reauth initiated");

      return {
        success: true,
        monoUrl: data.mono_url, // Verify response structure
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MonoAuthService();
