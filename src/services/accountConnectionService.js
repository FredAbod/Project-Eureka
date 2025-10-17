/**
 * Account Connection Service
 * 
 * This service handles the mock bank account connection flow.
 * In production, this would integrate with a real bank API (e.g., Plaid, Mono, Okra)
 * 
 * The mock flow simulates:
 * 1. User initiates connection
 * 2. System requests account number
 * 3. System requests PIN/password
 * 4. System verifies and connects account
 */

const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');

// Mock bank accounts database (simulates real bank)
// In production, this would be replaced with actual bank API calls
const MOCK_BANK_ACCOUNTS = {
  '1234567890': {
    accountNumber: '1234567890',
    accountName: 'John Doe',
    pin: '1234',
    bankName: 'First Bank of Nigeria',
    accountType: 'savings'
  },
  '0987654321': {
    accountNumber: '0987654321',
    accountName: 'Jane Smith',
    pin: '5678',
    bankName: 'GTBank',
    accountType: 'checking'
  },
  '1111222233': {
    accountNumber: '1111222233',
    accountName: 'Fredabod Technologies',
    pin: '9999',
    bankName: 'Access Bank',
    accountType: 'business'
  }
};

/**
 * Check if user has a connected bank account
 * @param {string} phoneNumber 
 * @returns {Promise<boolean>}
 */
async function isAccountConnected(phoneNumber) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    return user && user.bankAccountConnected === true;
  } catch (error) {
    console.error('Error checking account connection status:', error);
    return false;
  }
}

/**
 * Get user's connection status and details
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function getConnectionStatus(phoneNumber) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user) {
      return {
        connected: false,
        message: 'User not found'
      };
    }

    if (user.bankAccountConnected) {
      return {
        connected: true,
        accountId: user.bankAccountId,
        connectedDate: user.bankConnectionDate,
        message: 'Account is connected'
      };
    }

    return {
      connected: false,
      message: 'No bank account connected'
    };
  } catch (error) {
    console.error('Error getting connection status:', error);
    return {
      connected: false,
      error: error.message
    };
  }
}

/**
 * Initiate account connection flow
 * Sets up the connection state and prompts user for account number
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function initiateConnection(phoneNumber) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found. Please contact support.'
      };
    }

    // Check if already connected
    if (user.bankAccountConnected) {
      return {
        success: false,
        alreadyConnected: true,
        message: 'Your bank account is already connected! You can start using banking features.'
      };
    }

    // Initialize connection state
    const connectionState = {
      step: 'awaiting_account_number',
      startedAt: Date.now(),
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };

    await userRepository.updateUser(phoneNumber, { connectionState });

    console.info('Connection flow initiated', { phoneNumber });

    return {
      success: true,
      step: 'awaiting_account_number',
      message: '🔗 Let\'s connect your bank account!\n\nPlease enter your 10-digit bank account number.\n\n(This connection expires in 10 minutes)'
    };

  } catch (error) {
    console.error('Error initiating connection:', error);
    return {
      success: false,
      message: 'Failed to initiate connection. Please try again.'
    };
  }
}

/**
 * Handle account number submission
 * @param {string} phoneNumber 
 * @param {string} accountNumber 
 * @returns {Promise<Object>}
 */
async function submitAccountNumber(phoneNumber, accountNumber) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user || !user.connectionState) {
      return {
        success: false,
        message: 'No active connection session. Please start over by saying "connect account".'
      };
    }

    // Check if expired
    if (Date.now() > user.connectionState.expiresAt) {
      await userRepository.updateUser(phoneNumber, { connectionState: null });
      return {
        success: false,
        expired: true,
        message: 'Connection session expired. Please start over by saying "connect account".'
      };
    }

    // Validate account number format
    const cleaned = accountNumber.replace(/\s/g, '');
    if (!/^\d{10}$/.test(cleaned)) {
      return {
        success: false,
        invalidFormat: true,
        message: '❌ Invalid account number format. Please enter a 10-digit account number.'
      };
    }

    // Check if account exists in mock bank (simulate bank lookup)
    const mockAccount = MOCK_BANK_ACCOUNTS[cleaned];
    
    if (!mockAccount) {
      // Increment attempts
      const attempts = user.connectionState.attempts + 1;
      
      if (attempts >= 3) {
        // Too many failed attempts
        await userRepository.updateUser(phoneNumber, { connectionState: null });
        return {
          success: false,
          tooManyAttempts: true,
          message: '❌ Account not found. Too many failed attempts. Please contact support or try again later.'
        };
      }

      // Update attempts
      const connectionState = {
        ...user.connectionState,
        attempts
      };
      await userRepository.updateUser(phoneNumber, { connectionState });

      return {
        success: false,
        notFound: true,
        attemptsRemaining: 3 - attempts,
        message: `❌ Account number not found. Please check and try again.\n\n(${3 - attempts} attempts remaining)`
      };
    }

    // Account found! Move to PIN verification step
    const connectionState = {
      ...user.connectionState,
      step: 'awaiting_pin',
      accountNumber: cleaned,
      accountName: mockAccount.accountName,
      bankName: mockAccount.bankName,
      attempts: 0 // Reset attempts for PIN
    };

    await userRepository.updateUser(phoneNumber, { connectionState });

    console.info('Account number verified', { phoneNumber, accountNumber: cleaned });

    return {
      success: true,
      step: 'awaiting_pin',
      accountName: mockAccount.accountName,
      bankName: mockAccount.bankName,
      message: `✅ Account Found!\n\n${mockAccount.accountName}\n${mockAccount.bankName}\n\nPlease enter your 4-digit PIN to complete the connection.\n\n🔒 Your PIN is encrypted and secure.`
    };

  } catch (error) {
    console.error('Error submitting account number:', error);
    return {
      success: false,
      message: 'Error processing account number. Please try again.'
    };
  }
}

/**
 * Handle PIN submission and complete connection
 * @param {string} phoneNumber 
 * @param {string} pin 
 * @returns {Promise<Object>}
 */
async function submitPin(phoneNumber, pin) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user || !user.connectionState || user.connectionState.step !== 'awaiting_pin') {
      return {
        success: false,
        message: 'No active PIN verification session. Please start over.'
      };
    }

    // Check if expired
    if (Date.now() > user.connectionState.expiresAt) {
      await userRepository.updateUser(phoneNumber, { connectionState: null });
      return {
        success: false,
        expired: true,
        message: 'Connection session expired. Please start over.'
      };
    }

    // Validate PIN format
    const cleaned = pin.replace(/\s/g, '');
    if (!/^\d{4}$/.test(cleaned)) {
      return {
        success: false,
        invalidFormat: true,
        message: '❌ Invalid PIN format. Please enter a 4-digit PIN.'
      };
    }

    // Verify PIN (simulate bank verification)
    const mockAccount = MOCK_BANK_ACCOUNTS[user.connectionState.accountNumber];
    
    if (!mockAccount || mockAccount.pin !== cleaned) {
      // Increment attempts
      const attempts = user.connectionState.attempts + 1;
      
      if (attempts >= 3) {
        // Too many failed attempts - lock connection
        await userRepository.updateUser(phoneNumber, { connectionState: null });
        return {
          success: false,
          tooManyAttempts: true,
          message: '❌ Incorrect PIN. Too many failed attempts. Please start over or contact support.'
        };
      }

      // Update attempts
      const connectionState = {
        ...user.connectionState,
        attempts
      };
      await userRepository.updateUser(phoneNumber, { connectionState });

      return {
        success: false,
        incorrectPin: true,
        attemptsRemaining: 3 - attempts,
        message: `❌ Incorrect PIN. Please try again.\n\n(${3 - attempts} attempts remaining)`
      };
    }

    // PIN verified! Complete the connection
    await userRepository.updateUser(phoneNumber, {
      bankAccountConnected: true,
      bankAccountId: user.connectionState.accountNumber,
      bankConnectionDate: new Date(),
      connectionState: null, // Clear connection state
      accountData: {
        accountNumber: mockAccount.accountNumber,
        accountName: mockAccount.accountName,
        bankName: mockAccount.bankName,
        accountType: mockAccount.accountType
      }
    });

    console.info('Bank account connected successfully', { 
      phoneNumber, 
      accountNumber: mockAccount.accountNumber 
    });

    return {
      success: true,
      connected: true,
      accountName: mockAccount.accountName,
      bankName: mockAccount.bankName,
      message: `🎉 Success!\n\nYour ${mockAccount.bankName} account has been connected!\n\nYou can now:\n✓ Check your balance\n✓ View transactions\n✓ Transfer money\n✓ Get spending insights\n\nTry asking me "What's my balance?" to get started!`
    };

  } catch (error) {
    console.error('Error submitting PIN:', error);
    return {
      success: false,
      message: 'Error verifying PIN. Please try again.'
    };
  }
}

/**
 * Handle user input during connection flow
 * Determines what step the user is on and routes accordingly
 * @param {string} phoneNumber 
 * @param {string} input 
 * @returns {Promise<Object>}
 */
async function handleConnectionInput(phoneNumber, input) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user || !user.connectionState) {
      return {
        success: false,
        noActiveSession: true,
        message: null // Let the AI handle this naturally
      };
    }

    const step = user.connectionState.step;

    switch (step) {
      case 'awaiting_account_number':
        return await submitAccountNumber(phoneNumber, input);
      
      case 'awaiting_pin':
        return await submitPin(phoneNumber, input);
      
      default:
        // Unknown step - clear state
        await userRepository.updateUser(phoneNumber, { connectionState: null });
        return {
          success: false,
          message: 'Invalid connection state. Please start over.'
        };
    }

  } catch (error) {
    console.error('Error handling connection input:', error);
    return {
      success: false,
      message: 'Error processing input. Please try again.'
    };
  }
}

/**
 * Cancel ongoing connection process
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function cancelConnection(phoneNumber) {
  try {
    await userRepository.updateUser(phoneNumber, { connectionState: null });
    
    return {
      success: true,
      message: 'Connection cancelled. You can start over anytime by saying "connect account".'
    };
  } catch (error) {
    console.error('Error cancelling connection:', error);
    return {
      success: false,
      message: 'Error cancelling connection.'
    };
  }
}

/**
 * Disconnect bank account
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function disconnectAccount(phoneNumber) {
  try {
    const user = await userRepository.getUserByPhone(phoneNumber);
    
    if (!user || !user.bankAccountConnected) {
      return {
        success: false,
        message: 'No bank account is currently connected.'
      };
    }

    await userRepository.updateUser(phoneNumber, {
      bankAccountConnected: false,
      bankAccountId: null,
      bankConnectionDate: null,
      accountData: {}
    });

    console.info('Bank account disconnected', { phoneNumber });

    return {
      success: true,
      message: '🔓 Your bank account has been disconnected. Your data has been cleared.\n\nYou can reconnect anytime by saying "connect account".'
    };

  } catch (error) {
    console.error('Error disconnecting account:', error);
    return {
      success: false,
      message: 'Error disconnecting account. Please try again.'
    };
  }
}

// Export all functions
module.exports = {
  isAccountConnected,
  getConnectionStatus,
  initiateConnection,
  submitAccountNumber,
  submitPin,
  handleConnectionInput,
  cancelConnection,
  disconnectAccount,
  MOCK_BANK_ACCOUNTS // Export for testing purposes
};
