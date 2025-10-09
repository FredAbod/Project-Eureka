const mockBank = require('../repositories/mockBankRepository');

async function getAccountsForUser(userId) {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('invalid_user_id');
    }
    
    const accounts = mockBank.getAccountsForUser(userId);
    
    if (!Array.isArray(accounts)) {
      console.error('Bank service returned invalid accounts data', { userId });
      throw new Error('invalid_accounts_data');
    }
    
    // Validate account data structure
    const validAccounts = accounts.filter(account => 
      account && 
      typeof account.name === 'string' && 
      typeof account.balance === 'number' &&
      !isNaN(account.balance)
    );
    
    if (validAccounts.length !== accounts.length) {
      console.warn('Some accounts filtered out due to invalid data', { 
        userId, 
        original: accounts.length, 
        valid: validAccounts.length 
      });
    }
    
    return validAccounts;
  } catch (err) {
    console.error('Error fetching accounts:', { userId, error: err.message });
    throw err;
  }
}

async function getTransactionsForUser(userId) {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('invalid_user_id');
    }
    
    const transactions = mockBank.getTransactionsForUser(userId);
    
    if (!Array.isArray(transactions)) {
      console.error('Bank service returned invalid transactions data', { userId });
      throw new Error('invalid_transactions_data');
    }
    
    // Validate transaction data structure
    const validTransactions = transactions.filter(tx => 
      tx && 
      typeof tx.date === 'string' && 
      typeof tx.desc === 'string' && 
      typeof tx.amount === 'number' &&
      !isNaN(tx.amount)
    );
    
    if (validTransactions.length !== transactions.length) {
      console.warn('Some transactions filtered out due to invalid data', { 
        userId, 
        original: transactions.length, 
        valid: validTransactions.length 
      });
    }
    
    return validTransactions.slice(0, 10); // Limit to 10 most recent
  } catch (err) {
    console.error('Error fetching transactions:', { userId, error: err.message });
    throw err;
  }
}

module.exports = { getAccountsForUser, getTransactionsForUser };
