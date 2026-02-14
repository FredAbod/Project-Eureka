const monoClient = require("./client");

/**
 * Mono Lookup Service
 * Handles bank lists and account verification.
 */
class MonoLookupService {
  /**
   * Get list of supported banks
   */
  async getBanks() {
    try {
      const data = await monoClient.request("/misc/banks", { method: "GET" });

      const banks = data.data.map((b) => ({
        name: b.name,
        code: b.code,
        type: b.type,
      }));

      // Cache logic could go here
      return { success: true, banks };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Lookup bank account to verify recipient
   * @param {string} accountNumber
   * @param {string} bankCode
   */
  async lookupBankAccount(accountNumber, bankCode) {
    try {
      const payload = {
        account_number: accountNumber,
        bank_code: bankCode,
      };

      const data = await monoClient.request("/lookup/account", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      console.log(`✅ Account Verified: ${data.data.name}`);

      return {
        success: true,
        accountName: data.data.name,
        accountNumber: data.data.account_number,
        bankCode: data.data.bank_code,
      };
    } catch (error) {
      console.error("❌ Lookup failed:", error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MonoLookupService();
