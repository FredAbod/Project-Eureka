/**
 * Bank Service
 * Handles banking operations with real Mongo/Mono integration
 * Supports multiple accounts per user
 */

const BankAccount = require("../models/BankAccount");
const User = require("../models/User");
const monoService = require("./monoService");

class BankService {
  /**
   * Get all linked bank accounts for a user
   * @param {string} userId - User's MongoDB ID
   * @returns {Promise<Array>} List of bank accounts
   */
  async getAccountsForUser(userId) {
    try {
      const accounts = await BankAccount.find({
        userId,
        isActive: true,
      }).sort({ isPrimary: -1, createdAt: -1 });

      return accounts.map((acc) => ({
        id: acc._id.toString(),
        name: acc.accountName,
        accountNumber: this.maskAccountNumber(acc.accountNumber),
        bankName: acc.bankName,
        balance: acc.balance,
        balanceNaira: acc.balance / 100,
        currency: acc.currency,
        type: acc.accountType,
        isPrimary: acc.isPrimary,
        lastSynced: acc.lastSynced,
      }));
    } catch (error) {
      console.error("Error getting accounts for user:", error);
      return [];
    }
  }

  /**
   * Get aggregated balance across all accounts
   * @param {string} userId - User's MongoDB ID
   * @returns {Promise<Object>} Total balance and breakdown
   */
  async getAggregatedBalance(userId) {
    try {
      const accounts = await BankAccount.find({
        userId,
        isActive: true,
      });

      if (accounts.length === 0) {
        return {
          totalBalance: 0,
          totalBalanceNaira: 0,
          currency: "NGN",
          accountCount: 0,
          accounts: [],
        };
      }

      const totalBalance = accounts.reduce(
        (sum, acc) => sum + (acc.balance || 0),
        0,
      );

      return {
        totalBalance,
        totalBalanceNaira: totalBalance / 100,
        currency: "NGN",
        accountCount: accounts.length,
        accounts: accounts.map((acc) => ({
          bankName: acc.bankName,
          accountNumber: this.maskAccountNumber(acc.accountNumber),
          balance: acc.balance,
          balanceNaira: acc.balance / 100,
          type: acc.accountType,
        })),
      };
    } catch (error) {
      console.error("Error getting aggregated balance:", error);
      return {
        totalBalance: 0,
        totalBalanceNaira: 0,
        currency: "NGN",
        accountCount: 0,
        accounts: [],
      };
    }
  }

  /**
   * Get transactions for a user (from all accounts or specific account)
   * @param {string} userId - User's MongoDB ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of transactions
   */
  async getTransactionsForUser(userId, options = {}) {
    try {
      const { accountId, limit = 20, page = 1 } = options;

      let accounts;
      if (accountId) {
        const account = await BankAccount.findOne({ _id: accountId, userId });
        accounts = account ? [account] : [];
      } else {
        accounts = await BankAccount.find({ userId, isActive: true });
      }

      if (accounts.length === 0) {
        return [];
      }

      // Fetch transactions from Mono for each account
      const allTransactions = [];

      for (const account of accounts) {
        if (account.monoAccountId) {
          const result = await monoService.getTransactions(
            account.monoAccountId,
            {
              page,
              limit: Math.ceil(limit / accounts.length),
            },
          );

          if (result.success && result.transactions) {
            const txsWithBank = result.transactions.map((tx) => ({
              ...tx,
              bankName: account.bankName,
              accountNumber: this.maskAccountNumber(account.accountNumber),
            }));
            allTransactions.push(...txsWithBank);
          }
        }
      }

      // Deduplicate transactions (same narration + amount + type + date = duplicate)
      const seen = new Set();
      const uniqueTransactions = allTransactions.filter((tx) => {
        const key = `${tx.narration || tx.description}_${tx.amount}_${tx.type}_${tx.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by date descending and limit
      return uniqueTransactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
    } catch (error) {
      console.error("Error getting transactions:", error);
      return [];
    }
  }

  /**
   * Refresh balances from Mono for all user accounts
   * @param {string} userId - User's MongoDB ID
   * @returns {Promise<Object>} Refresh results
   */
  async refreshAccountBalances(userId) {
    try {
      const accounts = await BankAccount.find({ userId, isActive: true });
      const results = [];

      for (const account of accounts) {
        if (account.monoAccountId) {
          const details = await monoService.getAccountDetails(
            account.monoAccountId,
          );

          if (details.success) {
            account.balance = details.account.balance;
            account.lastSynced = new Date();
            await account.save();

            results.push({
              bankName: account.bankName,
              success: true,
              newBalance: details.account.balance,
            });
          } else {
            results.push({
              bankName: account.bankName,
              success: false,
              error: details.error,
            });
          }
        }
      }

      return {
        success: true,
        refreshed: results.filter((r) => r.success).length,
        total: accounts.length,
        results,
      };
    } catch (error) {
      console.error("Error refreshing balances:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a specific account by ID
   * @param {string} accountId - Account MongoDB ID
   * @param {string} userId - User's MongoDB ID (for auth check)
   * @returns {Promise<Object|null>} Account details or null
   */
  async getAccountById(accountId, userId) {
    try {
      const account = await BankAccount.findOne({ _id: accountId, userId });
      if (!account) return null;

      return {
        id: account._id.toString(),
        monoAccountId: account.monoAccountId,
        name: account.accountName,
        accountNumber: account.accountNumber,
        maskedNumber: this.maskAccountNumber(account.accountNumber),
        bankName: account.bankName,
        bankCode: account.bankCode,
        balance: account.balance,
        currency: account.currency,
        type: account.accountType,
        isPrimary: account.isPrimary,
      };
    } catch (error) {
      console.error("Error getting account by ID:", error);
      return null;
    }
  }

  /**
   * Set an account as primary
   * @param {string} accountId - Account MongoDB ID
   * @param {string} userId - User's MongoDB ID
   * @returns {Promise<boolean>} Success status
   */
  async setPrimaryAccount(accountId, userId) {
    try {
      // First, unset all primary flags for this user
      await BankAccount.updateMany({ userId }, { isPrimary: false });

      // Set the selected account as primary
      await BankAccount.updateOne(
        { _id: accountId, userId },
        { isPrimary: true },
      );

      return true;
    } catch (error) {
      console.error("Error setting primary account:", error);
      return false;
    }
  }

  /**
   * Mask account number for display (show last 4 digits)
   * @param {string} accountNumber - Full account number
   * @returns {string} Masked account number
   */
  maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) {
      return "****";
    }
    return "****" + accountNumber.slice(-4);
  }
}

module.exports = new BankService();
