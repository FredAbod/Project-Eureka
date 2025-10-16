/**
 * Test script for Groq AI integration
 * Tests function calling and conversation flow
 */

require('dotenv').config();
const aiService = require('../src/services/aiService');
const conversationService = require('../src/services/conversationService');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset}`, message);
}

async function testAIService() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Groq AI Integration');
  console.log('='.repeat(60) + '\n');

  // Check if API key is configured
  if (!aiService.isConfigured()) {
    log(colors.red, '❌ ERROR:', 'GROQ_API_KEY not set in .env');
    log(colors.yellow, '💡 TIP:', 'Get your API key from https://console.groq.com/keys');
    process.exit(1);
  }

  log(colors.green, '✓', 'Groq API configured');
  console.log();

  // Test cases
  const testCases = [
    {
      name: 'Balance Check',
      message: 'What is my account balance?',
      expectedFunction: 'check_balance'
    },
    {
      name: 'Transactions Query',
      message: 'Show me my recent transactions',
      expectedFunction: 'get_transactions'
    },
    {
      name: 'Transfer Request',
      message: 'Transfer 5000 naira from checking to savings',
      expectedFunction: 'transfer_money'
    },
    {
      name: 'Spending Insights',
      message: 'How much did I spend this month?',
      expectedFunction: 'get_spending_insights'
    },
    {
      name: 'Conversational Query',
      message: 'Hi, can you help me?',
      expectedFunction: null // Should return text, not function call
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    try {
      log(colors.cyan, '\n📝 Test:', test.name);
      log(colors.blue, '   User:', `"${test.message}"`);

      const response = await aiService.processMessage(test.message, []);

      if (response.type === 'function_call') {
        log(colors.yellow, '   AI →', `Function: ${response.function}`);
        log(colors.yellow, '   Args:', JSON.stringify(response.arguments, null, 2).replace(/\n/g, '\n         '));
        
        if (test.expectedFunction && response.function === test.expectedFunction) {
          log(colors.green, '   ✓', 'PASS - Correct function called');
          passed++;
        } else if (!test.expectedFunction) {
          log(colors.red, '   ✗', `FAIL - Expected text response, got function: ${response.function}`);
          failed++;
        } else {
          log(colors.red, '   ✗', `FAIL - Expected ${test.expectedFunction}, got ${response.function}`);
          failed++;
        }
      } else {
        const preview = response.content.substring(0, 80) + (response.content.length > 80 ? '...' : '');
        log(colors.yellow, '   AI →', `"${preview}"`);
        
        if (!test.expectedFunction) {
          log(colors.green, '   ✓', 'PASS - Text response received');
          passed++;
        } else {
          log(colors.red, '   ✗', `FAIL - Expected function ${test.expectedFunction}, got text`);
          failed++;
        }
      }

    } catch (error) {
      log(colors.red, '   ✗ ERROR:', error.message);
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  // Test function response generation
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Response Generation from Function Results');
  console.log('='.repeat(60) + '\n');

  try {
    const mockBalanceResult = {
      accounts: [
        { name: 'Checking', balance: 45320.50 },
        { name: 'Savings', balance: 125450.00 }
      ]
    };

    log(colors.cyan, '📝 Test:', 'Generate response from balance check result');
    
    const responseText = await aiService.generateResponseFromFunction(
      'check_balance',
      mockBalanceResult,
      []
    );

    log(colors.yellow, '   AI →', `"${responseText}"`);
    log(colors.green, '   ✓', 'PASS - Response generated successfully');

  } catch (error) {
    log(colors.red, '   ✗ ERROR:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ AI Integration Tests Complete!');
  console.log('='.repeat(60) + '\n');

  // Show available functions
  const functions = aiService.getAvailableFunctions();
  console.log('📋 Available Banking Functions:');
  functions.forEach(fn => {
    console.log(`   • ${fn.name}: ${fn.description}`);
  });
  console.log();
}

// Run tests
testAIService()
  .then(() => {
    console.log('✓ All tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
