const monoClient = require("./client");

/**
 * Mono Accounts Service
 * Handles account information, balances, and transactions.
 */
class MonoAccountsService {
  /**
   * Get account details
   * @param {string} accountId
   */
  async getAccountDetails(accountId) {
    try {
      const data = await monoClient.request(`/accounts/${accountId}`, {
        method: "GET",
      });

      const account = data.data.account;
      const meta = data.data.meta;

      console.log(
        `✅ Account details retrieved for ${account.institution.name}`,
      );

      return {
        success: true,
        account: {
          id: account.id,
          customer: account.customer,
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Get account balance
   * @param {string} accountId
   */
  async getBalance(accountId) {
    const result = await this.getAccountDetails(accountId);
    if (!result.success) return result;

    return {
      success: true,
      balance: result.account.balance,
      currency: result.account.currency,
    };
  }

  /**
   * Get transaction history
   * @param {string} accountId
   * @param {Object} options - { page, start, end }
   */
  async getTransactions(accountId, options = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (options.page) queryParams.append("page", options.page);
      if (options.start) queryParams.append("start", options.start);
      if (options.end) queryParams.append("end", options.end);

      const endpoint = `/accounts/${accountId}/transactions?${queryParams.toString()}`;
      const data = await monoClient.request(endpoint, { method: "GET" });

      console.log(`✅ Retrieved ${data.data.length} transactions`);

      return {
        success: true,
        transactions: data.data.map((tx) => ({
          id: tx.id,
          narration: tx.narration,
          amount: tx.amount,
          type: tx.type,
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Get account statement (PDF)
   * @param {string} accountId
   * @param {Object} options - { period, output }
   */
  async getStatement(accountId, options = {}) {
    try {
      const period = options.period || "last3months";
      const output = options.output || "pdf";

      const endpoint = `/accounts/${accountId}/statement?period=${period}&output=${output}`;
      const data = await monoClient.request(endpoint, { method: "GET" });

      console.log("✅ Statement retrieved");

      return { success: true, statement: data.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get identity information
   * @param {string} accountId
   */
  async getIdentity(accountId) {
    try {
      const data = await monoClient.request(`/accounts/${accountId}/identity`, {
        method: "GET",
      });

      return { success: true, identity: data.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Unlink an account
   * @param {string} accountId
   */
  async unlinkAccount(accountId) {
    try {
      await monoClient.request(`/accounts/${accountId}/unlink`, {
        method: "POST",
      });

      return { success: true, message: "Account unlinked successfully" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync account data
   * @param {string} accountId
   */
  async syncAccount(accountId) {
    try {
      const data = await monoClient.request(`/accounts/${accountId}/sync`, {
        method: "POST",
      });

      return { success: true, status: data.status, code: data.code };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MonoAccountsService();
