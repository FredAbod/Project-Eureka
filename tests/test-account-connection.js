/**
 * Test Account Connection Flow
 * 
 * This script tests the conversational account connection flow
 */

require('dotenv').config();
const accountConnectionService = require('../src/services/accountConnectionService');
const userRepository = require('../src/repositories/userRepository');
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

// Test phone numbers
const TEST_PHONE_NEW_USER = '+2348012345678';
const TEST_PHONE_EXISTING = '+2348087654321';

async function runTests() {
  console.log('🧪 Starting Account Connection Tests...\n');

  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database\n');

    // Test 1: Check connection status for new user
    console.log('Test 1: Check connection status for new user');
    console.log('─────────────────────────────────────────────');
    const status1 = await accountConnectionService.getConnectionStatus(TEST_PHONE_NEW_USER);
    console.log('Status:', status1);
    console.log(status1.connected ? '❌ FAIL' : '✅ PASS', '- New user should not be connected\n');

    // Test 2: Initiate connection for new user
    console.log('Test 2: Initiate connection for new user');
    console.log('─────────────────────────────────────────────');
    
    // First create the user
    try {
      await userRepository.createUser(TEST_PHONE_NEW_USER);
    } catch (e) {
      console.log('User already exists, continuing...');
    }
    
    const initResult = await accountConnectionService.initiateConnection(TEST_PHONE_NEW_USER);
    console.log('Result:', initResult);
    console.log(initResult.success ? '✅ PASS' : '❌ FAIL', '- Connection should be initiated\n');

    // Test 3: Submit invalid account number
    console.log('Test 3: Submit invalid account number');
    console.log('─────────────────────────────────────────────');
    const invalidAccount = await accountConnectionService.submitAccountNumber(TEST_PHONE_NEW_USER, '123');
    console.log('Result:', invalidAccount);
    console.log(!invalidAccount.success && invalidAccount.invalidFormat ? '✅ PASS' : '❌ FAIL', '- Should reject invalid format\n');

    // Test 4: Submit non-existent account number
    console.log('Test 4: Submit non-existent account number');
    console.log('─────────────────────────────────────────────');
    const notFound = await accountConnectionService.submitAccountNumber(TEST_PHONE_NEW_USER, '9999999999');
    console.log('Result:', notFound);
    console.log(!notFound.success && notFound.notFound ? '✅ PASS' : '❌ FAIL', '- Should reject non-existent account\n');

    // Test 5: Submit valid account number
    console.log('Test 5: Submit valid account number');
    console.log('─────────────────────────────────────────────');
    const validAccount = await accountConnectionService.submitAccountNumber(TEST_PHONE_NEW_USER, '1111222233');
    console.log('Result:', validAccount);
    console.log(validAccount.success && validAccount.step === 'awaiting_pin' ? '✅ PASS' : '❌ FAIL', '- Should accept valid account\n');

    // Test 6: Submit invalid PIN format
    console.log('Test 6: Submit invalid PIN format');
    console.log('─────────────────────────────────────────────');
    const invalidPin = await accountConnectionService.submitPin(TEST_PHONE_NEW_USER, '12');
    console.log('Result:', invalidPin);
    console.log(!invalidPin.success && invalidPin.invalidFormat ? '✅ PASS' : '❌ FAIL', '- Should reject invalid PIN format\n');

    // Test 7: Submit incorrect PIN
    console.log('Test 7: Submit incorrect PIN');
    console.log('─────────────────────────────────────────────');
    const wrongPin = await accountConnectionService.submitPin(TEST_PHONE_NEW_USER, '0000');
    console.log('Result:', wrongPin);
    console.log(!wrongPin.success && wrongPin.incorrectPin ? '✅ PASS' : '❌ FAIL', '- Should reject incorrect PIN\n');

    // Test 8: Submit correct PIN
    console.log('Test 8: Submit correct PIN and complete connection');
    console.log('─────────────────────────────────────────────');
    const correctPin = await accountConnectionService.submitPin(TEST_PHONE_NEW_USER, '9999');
    console.log('Result:', correctPin);
    console.log(correctPin.success && correctPin.connected ? '✅ PASS' : '❌ FAIL', '- Should connect successfully\n');

    // Test 9: Verify connection status after successful connection
    console.log('Test 9: Verify connection status after connection');
    console.log('─────────────────────────────────────────────');
    const status2 = await accountConnectionService.getConnectionStatus(TEST_PHONE_NEW_USER);
    console.log('Status:', status2);
    console.log(status2.connected ? '✅ PASS' : '❌ FAIL', '- User should now be connected\n');

    // Test 10: Try to initiate connection when already connected
    console.log('Test 10: Try to initiate when already connected');
    console.log('─────────────────────────────────────────────');
    const alreadyConnected = await accountConnectionService.initiateConnection(TEST_PHONE_NEW_USER);
    console.log('Result:', alreadyConnected);
    console.log(alreadyConnected.alreadyConnected ? '✅ PASS' : '❌ FAIL', '- Should indicate already connected\n');

    // Test 11: Disconnect account
    console.log('Test 11: Disconnect account');
    console.log('─────────────────────────────────────────────');
    const disconnect = await accountConnectionService.disconnectAccount(TEST_PHONE_NEW_USER);
    console.log('Result:', disconnect);
    console.log(disconnect.success ? '✅ PASS' : '❌ FAIL', '- Should disconnect successfully\n');

    // Test 12: Verify disconnection
    console.log('Test 12: Verify account is disconnected');
    console.log('─────────────────────────────────────────────');
    const status3 = await accountConnectionService.getConnectionStatus(TEST_PHONE_NEW_USER);
    console.log('Status:', status3);
    console.log(!status3.connected ? '✅ PASS' : '❌ FAIL', '- User should be disconnected\n');

    console.log('═══════════════════════════════════════════════');
    console.log('🎉 All tests completed!\n');

    // Display available test accounts
    console.log('📋 Available Test Accounts:');
    console.log('─────────────────────────────────────────────');
    console.log('Account: 1234567890 | PIN: 1234 | Name: John Doe');
    console.log('Account: 0987654321 | PIN: 5678 | Name: Jane Smith');
    console.log('Account: 1111222233 | PIN: 9999 | Name: Fredabod Technologies');
    console.log('─────────────────────────────────────────────\n');

  } catch (error) {
    console.error('❌ Test Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run tests
runTests();
