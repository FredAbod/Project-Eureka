/**
 * Bank Service
 * Handles banking operations
 */

class BankService {
  async getAccountsForUser(userId) {
    // Stub: return mock accounts
    return [
      { name: "Savings", balance: 50000, type: "savings" },
      { name: "Checking", balance: 25000, type: "checking" },
    ];
  }

  async getTransactionsForUser(userId) {
    // Stub: return mock transactions
    return [{ date: "2023-01-01", desc: "Transfer", amount: 5000 }];
  }
}

module.exports = new BankService();
