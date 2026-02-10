/**
 * Bank Lookup Service
 * Handles account verification and bank list lookups for transfers
 */

const monoService = require("./monoService");

// Nigerian bank list with codes (common banks)
const NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044", aliases: ["access"] },
  { name: "Citibank Nigeria", code: "023", aliases: ["citi", "citibank"] },
  { name: "Ecobank Nigeria", code: "050", aliases: ["eco", "ecobank"] },
  { name: "Fidelity Bank", code: "070", aliases: ["fidelity"] },
  {
    name: "First Bank of Nigeria",
    code: "011",
    aliases: ["first bank", "firstbank", "fbn"],
  },
  { name: "First City Monument Bank", code: "214", aliases: ["fcmb"] },
  { name: "Globus Bank", code: "103", aliases: ["globus"] },
  {
    name: "Guaranty Trust Bank",
    code: "058",
    aliases: ["gtbank", "gtb", "gt bank"],
  },
  { name: "Heritage Bank", code: "030", aliases: ["heritage"] },
  { name: "Jaiz Bank", code: "301", aliases: ["jaiz"] },
  { name: "Keystone Bank", code: "082", aliases: ["keystone"] },
  { name: "Kuda Bank", code: "090267", aliases: ["kuda"] },
  { name: "Opay", code: "100004", aliases: ["opay", "paycom"] },
  { name: "Palmpay", code: "999991", aliases: ["palmpay", "palm pay"] },
  { name: "Polaris Bank", code: "076", aliases: ["polaris"] },
  { name: "Providus Bank", code: "101", aliases: ["providus"] },
  { name: "Stanbic IBTC Bank", code: "221", aliases: ["stanbic", "ibtc"] },
  {
    name: "Standard Chartered Bank",
    code: "068",
    aliases: ["standard chartered", "stanchart"],
  },
  { name: "Sterling Bank", code: "232", aliases: ["sterling"] },
  { name: "SunTrust Bank", code: "100", aliases: ["suntrust"] },
  { name: "Titan Trust Bank", code: "102", aliases: ["titan"] },
  { name: "Union Bank", code: "032", aliases: ["union"] },
  { name: "United Bank for Africa", code: "033", aliases: ["uba"] },
  { name: "Unity Bank", code: "215", aliases: ["unity"] },
  { name: "Wema Bank", code: "035", aliases: ["wema", "alat"] },
  { name: "Zenith Bank", code: "057", aliases: ["zenith"] },
  {
    name: "Moniepoint",
    code: "999993",
    aliases: ["moniepoint", "monie point"],
  },
];

class BankLookupService {
  /**
   * Get list of all supported banks
   * @returns {Array} List of banks with name and code
   */
  getBankList() {
    return NIGERIAN_BANKS.map((bank) => ({
      name: bank.name,
      code: bank.code,
    }));
  }

  /**
   * Find bank by name (fuzzy match)
   * @param {string} bankName - Bank name to search
   * @returns {Object|null} Bank details or null
   */
  findBankByName(bankName) {
    if (!bankName) return null;

    const normalized = bankName.toLowerCase().trim();

    // First try exact match
    const exactMatch = NIGERIAN_BANKS.find(
      (bank) => bank.name.toLowerCase() === normalized,
    );
    if (exactMatch) {
      return { name: exactMatch.name, code: exactMatch.code };
    }

    // Then try alias match
    const aliasMatch = NIGERIAN_BANKS.find((bank) =>
      bank.aliases.some(
        (alias) =>
          alias.toLowerCase() === normalized ||
          normalized.includes(alias.toLowerCase()),
      ),
    );
    if (aliasMatch) {
      return { name: aliasMatch.name, code: aliasMatch.code };
    }

    // Finally try partial match
    const partialMatch = NIGERIAN_BANKS.find(
      (bank) =>
        bank.name.toLowerCase().includes(normalized) ||
        normalized.includes(bank.name.toLowerCase().split(" ")[0]),
    );
    if (partialMatch) {
      return { name: partialMatch.name, code: partialMatch.code };
    }

    return null;
  }

  /**
   * Get bank by code
   * @param {string} bankCode - Bank code
   * @returns {Object|null} Bank details or null
   */
  getBankByCode(bankCode) {
    const bank = NIGERIAN_BANKS.find((b) => b.code === bankCode);
    return bank ? { name: bank.name, code: bank.code } : null;
  }

  /**
   * Look up account to verify recipient before transfer
   * Uses Mono's account lookup API
   * @param {string} accountNumber - Account number to verify
   * @param {string} bankNameOrCode - Bank name or code
   * @returns {Promise<Object>} Account holder name and verification status
   */
  async lookupAccount(accountNumber, bankNameOrCode) {
    try {
      // Find bank code if name was provided
      let bankCode = bankNameOrCode;
      let bankName = bankNameOrCode;

      // Check if it's a code (numeric) or name
      if (!/^\d+$/.test(bankNameOrCode)) {
        const bank = this.findBankByName(bankNameOrCode);
        if (!bank) {
          return {
            success: false,
            error: `Unknown bank: ${bankNameOrCode}. Please specify a valid Nigerian bank.`,
          };
        }
        bankCode = bank.code;
        bankName = bank.name;
      } else {
        const bank = this.getBankByCode(bankNameOrCode);
        if (bank) {
          bankName = bank.name;
        }
      }

      // Validate account number format (Nigerian accounts are 10 digits)
      if (!/^\d{10}$/.test(accountNumber)) {
        return {
          success: false,
          error:
            "Invalid account number. Nigerian account numbers are 10 digits.",
        };
      }

      // Call Mono lookup API
      const result = await monoService.lookupBankAccount(
        accountNumber,
        bankCode,
      );

      if (result.success) {
        return {
          success: true,
          accountNumber,
          accountName: result.accountName,
          bankName,
          bankCode,
          verified: true,
        };
      } else {
        // Mono lookup failed — try Flutterwave as fallback
        console.log("⚠️ Mono lookup failed, trying Flutterwave fallback...");

        const flutterwaveResult = await this.resolveAccountFlutterwave(
          accountNumber,
          bankCode,
        );

        if (flutterwaveResult.success) {
          return {
            success: true,
            accountNumber,
            accountName: flutterwaveResult.accountName,
            bankName,
            bankCode,
            verified: true,
            source: "flutterwave",
          };
        }

        // Both failed — return without name
        return {
          success: false,
          accountNumber,
          accountName: null,
          bankName,
          bankCode,
          verified: false,
          error:
            "Could not verify account holder name. Please check the account number and bank.",
        };
      }
    } catch (error) {
      console.error("Account lookup error:", error);
      return {
        success: false,
        error: "Failed to look up account. Please try again.",
      };
    }
  }

  /**
   * Flutterwave fallback: Resolve account name
   * @param {string} accountNumber - 10-digit account number
   * @param {string} bankCode - Bank code (NIP code)
   * @returns {Promise<Object>} - { success, accountName }
   */
  async resolveAccountFlutterwave(accountNumber, bankCode) {
    try {
      const flwSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!flwSecretKey) {
        console.warn("⚠️ FLUTTERWAVE_SECRET_KEY not set, cannot use fallback");
        return { success: false, error: "Flutterwave key not configured" };
      }

      const response = await fetch(
        "https://api.flutterwave.com/v3/accounts/resolve",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${flwSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_number: accountNumber,
            account_bank: bankCode,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && data.status === "success") {
        console.log("✅ Flutterwave resolved:", data.data?.account_name);
        return {
          success: true,
          accountName: data.data?.account_name,
        };
      }

      const errorMessage = data.message || "Unknown error";
      console.warn("❌ Flutterwave resolve failed:", errorMessage);

      // Check for specific test mode error
      if (errorMessage.includes("044 is allowed")) {
        console.warn(
          "⚠️ Flutterwave Test Mode detected: Only Access Bank (044) is supported.",
        );
        return {
          success: false,
          error:
            "Flutterwave Test Mode: Only Access Bank (044) can be verified. Please use Live Key for other banks.",
        };
      }

      return { success: false, error: errorMessage };
    } catch (error) {
      console.error("❌ Flutterwave resolve error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search banks by partial name
   * @param {string} query - Search query
   * @returns {Array} Matching banks
   */
  searchBanks(query) {
    if (!query || query.length < 2) {
      return [];
    }

    const normalized = query.toLowerCase().trim();

    return NIGERIAN_BANKS.filter(
      (bank) =>
        bank.name.toLowerCase().includes(normalized) ||
        bank.aliases.some((alias) => alias.includes(normalized)),
    )
      .map((bank) => ({ name: bank.name, code: bank.code }))
      .slice(0, 5); // Limit to 5 results
  }
}

module.exports = new BankLookupService();
