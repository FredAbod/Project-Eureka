/**
 * Mono Controller
 * Handles HTTP requests for Mono bank account operations
 */

const monoService = require('../services/monoService');
const User = require('../models/User');
const BankAccount = require('../models/BankAccount');

/**
 * Start bank account linking process
 * POST /api/mono/initiate
 */
const initiateAccountLinking = async (req, res) => {
  try {
    const { phoneNumber, name, email } = req.body;

    if (!phoneNumber || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, name, and email are required'
      });
    }

    // Find or create user
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = new User({ phoneNumber, name, email });
      await user.save();
    }

    // Generate Mono Connect URL
    const redirectUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/mono/callback`;
    const ref = `user_${user._id}`;

    const result = await monoService.initiateAccountLinking(
      { name, email },
      redirectUrl,
      ref
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      message: 'Account linking initiated',
      monoUrl: result.monoUrl,
      ref: result.ref
    });
  } catch (error) {
    console.error('❌ Error in initiateAccountLinking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Handle Mono callback after successful account linking
 * GET /api/mono/callback?code=xxxxx
 */
const handleCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    // Exchange code for account ID
    const tokenResult = await monoService.exchangeToken(code);

    if (!tokenResult.success) {
      return res.status(500).json(tokenResult);
    }

    const accountId = tokenResult.accountId;

    // Fetch account details
    const accountResult = await monoService.getAccountDetails(accountId);

    if (!accountResult.success) {
      return res.status(500).json(accountResult);
    }

    // TODO: Extract user ID from ref parameter
    // For now, return the account details
    // In production, you'd save this to the database linked to the user

    res.json({
      success: true,
      message: 'Account linked successfully!',
      account: accountResult.account
    });
  } catch (error) {
    console.error('❌ Error in handleCallback:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Link a bank account (complete flow)
 * POST /api/mono/link-account
 * Body: { code, phoneNumber }
 */
const linkAccount = async (req, res) => {
  try {
    const { code, phoneNumber } = req.body;

    if (!code || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Code and phone number are required'
      });
    }

    // Find user
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Exchange code for account ID
    const tokenResult = await monoService.exchangeToken(code);
    if (!tokenResult.success) {
      return res.status(500).json(tokenResult);
    }

    const accountId = tokenResult.accountId;

    // Fetch account details
    const accountResult = await monoService.getAccountDetails(accountId);
    if (!accountResult.success) {
      return res.status(500).json(accountResult);
    }

    // Check if account already exists
    let bankAccount = await BankAccount.findOne({ monoAccountId: accountId });

    if (bankAccount) {
      // Update existing account
      bankAccount.accountNumber = accountResult.account.accountNumber;
      bankAccount.accountName = accountResult.account.name;
      bankAccount.bankName = accountResult.account.institution.name;
      bankAccount.bankCode = accountResult.account.institution.bankCode;
      bankAccount.balance = accountResult.account.balance;
      bankAccount.currency = accountResult.account.currency;
      bankAccount.accountType = accountResult.account.type;
      bankAccount.lastSynced = new Date();
    } else {
      // Create new account
      bankAccount = new BankAccount({
        userId: user._id,
        monoAccountId: accountId,
        accountNumber: accountResult.account.accountNumber,
        accountName: accountResult.account.name,
        bankName: accountResult.account.institution.name,
        bankCode: accountResult.account.institution.bankCode,
        balance: accountResult.account.balance,
        currency: accountResult.account.currency,
        accountType: accountResult.account.type,
        isActive: true,
        lastSynced: new Date()
      });
    }

    await bankAccount.save();

    // Add account to user's linked accounts if not already there
    if (!user.linkedAccounts.includes(bankAccount._id)) {
      user.linkedAccounts.push(bankAccount._id);
      await user.save();
    }

    res.json({
      success: true,
      message: 'Bank account linked successfully!',
      account: {
        id: bankAccount._id,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        bankName: bankAccount.bankName,
        balance: bankAccount.balance,
        currency: bankAccount.currency
      }
    });
  } catch (error) {
    console.error('❌ Error in linkAccount:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get all linked accounts for a user
 * GET /api/mono/accounts?phoneNumber=xxx
 */
const getLinkedAccounts = async (req, res) => {
  try {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const user = await User.findOne({ phoneNumber }).populate('linkedAccounts');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      accounts: user.linkedAccounts.map(acc => ({
        id: acc._id,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        bankName: acc.bankName,
        balance: acc.balance,
        currency: acc.currency,
        isActive: acc.isActive,
        lastSynced: acc.lastSynced
      }))
    });
  } catch (error) {
    console.error('❌ Error in getLinkedAccounts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get account balance
 * GET /api/mono/balance/:accountId
 */
const getBalance = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Sync with Mono to get latest balance
    const result = await monoService.getBalance(bankAccount.monoAccountId);

    if (!result.success) {
      // Return cached balance if API fails
      return res.json({
        success: true,
        balance: bankAccount.balance,
        currency: bankAccount.currency,
        cached: true,
        lastSynced: bankAccount.lastSynced
      });
    }

    // Update cached balance
    bankAccount.balance = result.balance;
    bankAccount.lastSynced = new Date();
    await bankAccount.save();

    res.json({
      success: true,
      balance: result.balance,
      currency: result.currency,
      cached: false,
      lastSynced: bankAccount.lastSynced
    });
  } catch (error) {
    console.error('❌ Error in getBalance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get transaction history
 * GET /api/mono/transactions/:accountId?page=1&start=2024-01-01&end=2024-12-31
 */
const getTransactions = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page, start, end } = req.query;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const result = await monoService.getTransactions(bankAccount.monoAccountId, {
      page: page ? parseInt(page) : 1,
      start,
      end
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      transactions: result.transactions,
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Error in getTransactions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Sync account data
 * POST /api/mono/sync/:accountId
 */
const syncAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Trigger sync
    const result = await monoService.syncAccount(bankAccount.monoAccountId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Fetch updated account details
    const accountResult = await monoService.getAccountDetails(bankAccount.monoAccountId);

    if (accountResult.success) {
      bankAccount.balance = accountResult.account.balance;
      bankAccount.lastSynced = new Date();
      await bankAccount.save();
    }

    res.json({
      success: true,
      message: 'Account synced successfully',
      account: {
        balance: bankAccount.balance,
        lastSynced: bankAccount.lastSynced
      }
    });
  } catch (error) {
    console.error('❌ Error in syncAccount:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Unlink a bank account
 * DELETE /api/mono/unlink/:accountId
 */
const unlinkAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const bankAccount = await BankAccount.findById(accountId);

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Unlink from Mono
    const result = await monoService.unlinkAccount(bankAccount.monoAccountId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Mark as inactive (don't delete to preserve history)
    bankAccount.isActive = false;
    await bankAccount.save();

    // Remove from user's linked accounts
    await User.updateOne(
      { _id: bankAccount.userId },
      { $pull: { linkedAccounts: bankAccount._id } }
    );

    res.json({
      success: true,
      message: 'Account unlinked successfully'
    });
  } catch (error) {
    console.error('❌ Error in unlinkAccount:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get list of supported banks
 * GET /api/mono/banks
 */
const getBanks = async (req, res) => {
  try {
    const result = await monoService.getBanks();

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      banks: result.banks
    });
  } catch (error) {
    console.error('❌ Error in getBanks:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  initiateAccountLinking,
  handleCallback,
  linkAccount,
  getLinkedAccounts,
  getBalance,
  getTransactions,
  syncAccount,
  unlinkAccount,
  getBanks
};
