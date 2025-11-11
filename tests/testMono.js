/**
 * Mono Integration Test Script
 * Run this to test all Mono API endpoints
 * 
 * Usage: node tests/testMono.js
 */

require('dotenv').config();
const monoService = require('../src/services/monoService');

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function testMonoIntegration() {
  log('\n🚀 Starting Mono Integration Tests...\n', 'cyan');

  // Check environment variables
  logSection('1. Environment Check');
  
  if (!process.env.MONO_PUBLIC_KEY) {
    logError('MONO_PUBLIC_KEY not set');
    return;
  }
  logSuccess('MONO_PUBLIC_KEY found');

  if (!process.env.MONO_SECRET_KEY) {
    logError('MONO_SECRET_KEY not set');
    return;
  }
  logSuccess('MONO_SECRET_KEY found');

  // Test 1: Get list of supported banks
  logSection('2. Get Supported Banks');
  
  try {
    const banksResult = await monoService.getBanks();
    
    if (banksResult.success) {
      logSuccess(`Retrieved ${banksResult.banks.length} banks`);
      
      // Show first 5 banks
      logInfo('Sample banks:');
      banksResult.banks.slice(0, 5).forEach(bank => {
        console.log(`   - ${bank.name} (${bank.code})`);
      });
    } else {
      logError(`Failed to fetch banks: ${banksResult.error}`);
    }
  } catch (error) {
    logError(`Exception: ${error.message}`);
  }

  // Test 2: Initiate account linking
  logSection('3. Initiate Account Linking');
  
  try {
    const linkResult = await monoService.initiateAccountLinking(
      {
        name: 'Test User',
        email: 'test@example.com'
      },
      'http://localhost:3000/api/mono/callback',
      'test_ref_123'
    );

    if (linkResult.success) {
      logSuccess('Account linking initiated');
      logInfo('Mono Connect URL generated:');
      console.log(`   ${linkResult.monoUrl}`);
      logWarning('Open this URL in your browser to test account linking');
      
      // Store for manual testing
      global.testMonoUrl = linkResult.monoUrl;
    } else {
      logError(`Failed to initiate linking: ${linkResult.error}`);
    }
  } catch (error) {
    logError(`Exception: ${error.message}`);
  }

  // Test 3: Instructions for manual testing
  logSection('4. Manual Testing Required');
  
  logInfo('To complete the test:');
  console.log('   1. Copy the Mono Connect URL above');
  console.log('   2. Open it in your browser');
  console.log('   3. Select a bank (e.g., GTBank)');
  console.log('   4. Enter test credentials (check Mono docs)');
  console.log('   5. Complete the linking process');
  console.log('   6. Copy the code from the callback URL');
  console.log('   7. Run: node tests/testMonoCallback.js <code>');

  // Test 4: Check if we have a test account ID
  logSection('5. Test Account Operations');
  
  const testAccountId = process.env.TEST_MONO_ACCOUNT_ID;
  
  if (testAccountId) {
    logInfo('Testing with account ID: ' + testAccountId);

    // Test getting account details
    try {
      const accountResult = await monoService.getAccountDetails(testAccountId);
      
      if (accountResult.success) {
        logSuccess('Account details retrieved');
        console.log(`   Bank: ${accountResult.account.institution.name}`);
        console.log(`   Account: ${accountResult.account.accountNumber}`);
        console.log(`   Balance: ₦${accountResult.account.balance.toLocaleString()}`);
      } else {
        logError(`Failed to get account: ${accountResult.error}`);
      }
    } catch (error) {
      logError(`Exception: ${error.message}`);
    }

    // Test getting balance
    try {
      const balanceResult = await monoService.getBalance(testAccountId);
      
      if (balanceResult.success) {
        logSuccess('Balance retrieved');
        console.log(`   Balance: ₦${balanceResult.balance.toLocaleString()}`);
      } else {
        logError(`Failed to get balance: ${balanceResult.error}`);
      }
    } catch (error) {
      logError(`Exception: ${error.message}`);
    }

    // Test getting transactions
    try {
      const txResult = await monoService.getTransactions(testAccountId, { page: 1 });
      
      if (txResult.success) {
        logSuccess(`Retrieved ${txResult.transactions.length} transactions`);
        
        if (txResult.transactions.length > 0) {
          logInfo('Recent transactions:');
          txResult.transactions.slice(0, 3).forEach(tx => {
            const emoji = tx.type === 'credit' ? '💚' : '💸';
            console.log(`   ${emoji} ${tx.narration} - ₦${Math.abs(tx.amount).toLocaleString()}`);
          });
        }
      } else {
        logError(`Failed to get transactions: ${txResult.error}`);
      }
    } catch (error) {
      logError(`Exception: ${error.message}`);
    }
  } else {
    logWarning('No TEST_MONO_ACCOUNT_ID set in .env');
    logInfo('To test account operations:');
    console.log('   1. Complete account linking (step 4)');
    console.log('   2. Add TEST_MONO_ACCOUNT_ID=<account_id> to .env');
    console.log('   3. Run this test again');
  }

  // Summary
  logSection('Summary');
  
  logInfo('Tests completed!');
  console.log('');
  logInfo('Next steps:');
  console.log('   1. Test account linking manually (follow instructions above)');
  console.log('   2. Add TEST_MONO_ACCOUNT_ID to .env');
  console.log('   3. Run tests again to verify all operations');
  console.log('   4. Integrate with WhatsApp bot');
  console.log('');
  
  log('🎉 Mono integration is ready to use!', 'green');
  console.log('');
}

// Helper function to test with a specific code (from callback)
async function testWithCode(code) {
  logSection('Testing with Authorization Code');
  
  try {
    // Exchange code for account ID
    const tokenResult = await monoService.exchangeToken(code);
    
    if (!tokenResult.success) {
      logError(`Failed to exchange token: ${tokenResult.error}`);
      return;
    }
    
    logSuccess('Token exchanged successfully');
    const accountId = tokenResult.accountId;
    logInfo(`Account ID: ${accountId}`);
    
    // Get account details
    const accountResult = await monoService.getAccountDetails(accountId);
    
    if (accountResult.success) {
      logSuccess('Account details retrieved');
      console.log('\n📋 Account Information:');
      console.log(`   Bank: ${accountResult.account.institution.name}`);
      console.log(`   Account Name: ${accountResult.account.name}`);
      console.log(`   Account Number: ${accountResult.account.accountNumber}`);
      console.log(`   Balance: ₦${accountResult.account.balance.toLocaleString()}`);
      console.log(`   Currency: ${accountResult.account.currency}`);
      console.log(`   Type: ${accountResult.account.type}`);
      
      logInfo('\nAdd this to your .env file:');
      console.log(`   TEST_MONO_ACCOUNT_ID=${accountId}`);
    } else {
      logError(`Failed to get account: ${accountResult.error}`);
    }
  } catch (error) {
    logError(`Exception: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  const code = process.argv[2];
  
  if (code) {
    // Test with provided code
    testWithCode(code).catch(console.error);
  } else {
    // Run full test suite
    testMonoIntegration().catch(console.error);
  }
}

module.exports = { testMonoIntegration, testWithCode };
