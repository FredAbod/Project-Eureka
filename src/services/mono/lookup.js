const monoClient = require("./client");

const V3_BANKS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let v3BanksCache = null;
let v3BanksCacheTime = 0;

/**
 * Mono Lookup Service
 * Handles bank lists and account verification.
 */
class MonoLookupService {
  /**
   * Get V3 banks list (includes nip_code required for direct debit beneficiary)
   * GET https://api.withmono.com/v3/banks/list
   */
  async getBanksListV3() {
    if (v3BanksCache && Date.now() - v3BanksCacheTime < V3_BANKS_CACHE_TTL_MS) {
      return v3BanksCache;
    }
    try {
      const data = await monoClient.request(
        "https://api.withmono.com/v3/banks/list",
        { method: "GET", headers: monoClient.getV3Headers() },
      );
      const list = data.data?.banks ?? data.banks ?? [];
      v3BanksCache = Array.isArray(list) ? list : [];
      v3BanksCacheTime = Date.now();
      return v3BanksCache;
    } catch (error) {
      if (v3BanksCache) return v3BanksCache;
      console.warn("⚠️ getBanksListV3 failed:", error.message);
      return [];
    }
  }

  /**
   * Resolve bank_code (e.g. "011") to nip_code (6+ chars) for Mono debit beneficiary.
   * @param {string} bankCode - CBN/bank code (e.g. "011", "044")
   * @returns {Promise<string>} nip_code (e.g. "000011") or bankCode zero-padded to 6 chars as fallback
   */
  async getNipCodeForBankCode(bankCode) {
    if (!bankCode || typeof bankCode !== "string") return bankCode;
    const code = String(bankCode).trim();
    const banks = await this.getBanksListV3();
    const bank = banks.find(
      (b) =>
        String(b.bank_code || b.code || "").trim() === code ||
        String(b.bank_code || b.code || "").trim() === code.padStart(3, "0"),
    );
    let nipCode;
    if (bank && (bank.nip_code || bank.nipCode)) {
      nipCode = String(bank.nip_code || bank.nipCode).trim();
      console.log(
        `[Mono nip_code] bank_code=${code} -> nip_code=${nipCode} (from Mono list: ${bank.name || "?"})`,
      );
    } else {
      nipCode = code.padStart(6, "0");
      console.log(
        `[Mono nip_code] bank_code=${code} -> nip_code=${nipCode} (fallback, bank not in Mono list)`,
      );
    }
    return nipCode;
  }

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
