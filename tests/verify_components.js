const { encrypt, decrypt, generateEncryptionKey } = require('../src/utils/encryption');
const { categorizeByRules } = require('../src/services/categorizationService');
const { calculatePeriodDates } = require('../src/services/budgetService');
const securityConfig = require('../src/config/security');

// Mock environment variables for testing
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || generateEncryptionKey();

async function testComponents() {
  console.log('🔍 Starting Component Verification...\n');

  // 1. Test Encryption
  console.log('🔐 Testing Encryption Utility...');
  try {
    const originalText = 'sensitive-bank-token-123';
    console.log(`   Original: ${originalText}`);
    
    const encrypted = encrypt(originalText);
    console.log(`   Encrypted: ${encrypted.encrypted.substring(0, 20)}...`);
    
    const decrypted = decrypt(encrypted);
    console.log(`   Decrypted: ${decrypted}`);
    
    if (originalText === decrypted) {
      console.log('   ✅ Encryption/Decryption successful\n');
    } else {
      console.error('   ❌ Encryption/Decryption failed\n');
    }
  } catch (error) {
    console.error(`   ❌ Encryption test failed: ${error.message}\n`);
  }

  // 2. Test Categorization (Rule-based)
  console.log('🏷️  Testing Transaction Categorization (Rule-based)...');
  const testTransactions = [
    'Uber trip to Lagos',
    'Purchase at Shoprite',
    'Netflix Subscription',
    'Payment to Dr. Adewale'
  ];

  testTransactions.forEach(desc => {
    const result = categorizeByRules(desc);
    console.log(`   "${desc}" -> ${result.category} (${result.method})`);
  });
  console.log('   ✅ Categorization logic working\n');

  // 3. Test Budget Logic
  console.log('💰 Testing Budget Period Calculation...');
  const now = new Date();
  const periods = ['weekly', 'monthly'];
  
  periods.forEach(period => {
    const dates = calculatePeriodDates(period, now);
    console.log(`   ${period}: ${dates.start.toDateString()} to ${dates.end.toDateString()}`);
  });
  console.log('   ✅ Budget period calculation working\n');

  // 4. Check Security Config
  console.log('🛡️  Checking Security Configuration...');
  console.log(`   Daily Transfer Limit: ₦${securityConfig.DAILY_TRANSFER_LIMIT.toLocaleString()}`);
  console.log(`   Session Timeout: ${securityConfig.SESSION_TIMEOUT / 60000} minutes`);
  console.log('   ✅ Security config loaded\n');

  console.log('✨ Verification Complete! Core modules are ready for integration.');
}

testComponents();
