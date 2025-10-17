# Account Connection Flow

## Overview

This document describes the conversational account connection flow that allows users to connect their bank accounts via WhatsApp chat.

## Features

### ✅ What's Implemented

1. **Natural Conversation Flow**
   - AI-powered conversational interface
   - No rigid command structure
   - Context-aware responses
   - Multi-step guided process

2. **Account Connection States**
   - New users are guided to connect their account
   - Existing users can check connection status
   - Support for connection and disconnection

3. **Mock Bank Integration**
   - Simulated bank account verification
   - Mock account lookup by account number
   - Mock PIN verification
   - Easy to replace with real bank API later

4. **Security Features**
   - Account number validation (10 digits)
   - PIN verification (4 digits)
   - Attempt limiting (3 attempts max)
   - Session expiration (10 minutes)
   - Ability to cancel connection anytime

5. **User Experience**
   - Clear step-by-step instructions
   - Friendly error messages
   - Progress indicators
   - Success confirmation
   - Feature suggestions after connection

## How It Works

### For New Users

1. **First Contact**
   ```
   User: Hello
   Bot: Hi! Welcome to [Bank Name]! 👋
        
        To help you with banking features like checking balances, 
        viewing transactions, and more, you'll need to connect 
        your bank account first.
        
        Would you like to connect your account now?
   ```

2. **User Initiates Connection**
   ```
   User: Yes, connect my account
   Bot: 🔗 Let's connect your bank account!
        
        Please enter your 10-digit bank account number.
        
        (This connection expires in 10 minutes)
   ```

3. **Account Number Submission**
   ```
   User: 1111222233
   Bot: ✅ Account Found!
        
        Fredabod Technologies
        Access Bank
        
        Please enter your 4-digit PIN to complete the connection.
        
        🔒 Your PIN is encrypted and secure.
   ```

4. **PIN Verification**
   ```
   User: 9999
   Bot: 🎉 Success!
        
        Your Access Bank account has been connected!
        
        You can now:
        ✓ Check your balance
        ✓ View transactions
        ✓ Transfer money
        ✓ Get spending insights
        
        Try asking me "What's my balance?" to get started!
   ```

5. **Using Banking Features**
   ```
   User: What's my balance?
   Bot: Your account balances:
        Checking: ₦2,543.12
        Savings: ₦10,234.50
   ```

### For Returning Users

```
User: Hi
Bot: Welcome back! 👋 Your account is connected. 
     How can I help you today?

User: Show my balance
Bot: Your account balances:
     Checking: ₦2,543.12
     Savings: ₦10,234.50
```

## Connection States

### User Model Fields

```javascript
{
  bankAccountConnected: Boolean,  // Is account connected?
  bankAccountId: String,          // Bank account number
  bankConnectionDate: Date,       // When connected
  connectionState: {              // Temporary state during connection
    step: String,                 // Current step
    accountNumber: String,        // Submitted account number
    accountName: String,          // Account holder name
    bankName: String,            // Bank name
    attempts: Number,            // Failed attempts
    startedAt: Number,           // When started
    expiresAt: Number            // When expires
  }
}
```

### Connection Steps

1. **awaiting_account_number** - Waiting for user to submit account number
2. **awaiting_pin** - Waiting for user to submit PIN

## Mock Bank Accounts

For testing, the following accounts are available:

| Account Number | PIN  | Account Name           | Bank Name          |
|---------------|------|------------------------|-------------------|
| 1234567890    | 1234 | John Doe              | First Bank        |
| 0987654321    | 5678 | Jane Smith            | GTBank            |
| 1111222233    | 9999 | Fredabod Technologies | Access Bank       |

## API Functions

### Account Connection Service

Located in: `src/services/accountConnectionService.js`

#### Main Functions

```javascript
// Check if user has connected account
await isAccountConnected(phoneNumber)

// Get connection status details
await getConnectionStatus(phoneNumber)

// Start connection process
await initiateConnection(phoneNumber)

// Submit account number
await submitAccountNumber(phoneNumber, accountNumber)

// Submit PIN
await submitPin(phoneNumber, pin)

// Handle any input during connection
await handleConnectionInput(phoneNumber, input)

// Cancel connection process
await cancelConnection(phoneNumber)

// Disconnect account
await disconnectAccount(phoneNumber)
```

## Conversation Flow

### AI Functions

The AI has access to these functions:

1. **check_account_status** - Check if user has connected their account
2. **initiate_account_connection** - Start the connection process
3. **check_balance** - Get account balances (requires connection)
4. **get_transactions** - View transaction history (requires connection)
5. **transfer_money** - Transfer funds (requires connection)
6. **get_spending_insights** - Analyze spending (requires connection)

### Flow Logic

```
User Message
    ↓
Check if in connection flow
    ↓ YES
    Process connection input → Return response
    ↓ NO
    Check if confirming transaction
    ↓ YES
    Handle transaction confirmation → Return response
    ↓ NO
    Send to AI for processing
    ↓
    AI determines if function call needed
    ↓
    Execute function (with account check)
    ↓
    Generate natural language response
    ↓
    Return to user
```

## Security Considerations

### Current Implementation (Mock)

- Simulated bank account lookup
- Mock PIN verification
- Client-side validation
- No real banking credentials

### For Production (Real Bank API)

Replace mock with real integration:

1. **Use OAuth/OpenID Connect**
   - Redirect to bank's OAuth flow
   - Obtain user consent
   - Get access tokens

2. **Use Banking APIs**
   - Plaid (US/Canada)
   - Mono (Nigeria)
   - Okra (Nigeria)
   - Other local banking APIs

3. **Security Best Practices**
   - Store tokens encrypted
   - Use HTTPS only
   - Implement rate limiting
   - Log all access
   - Regular security audits
   - Comply with PCI DSS if needed

## Testing

Run the test suite:

```bash
node tests/test-account-connection.js
```

This tests:
- Connection status checks
- Connection initiation
- Account number validation
- PIN verification
- Error handling
- Connection completion
- Disconnection

## Example Conversations

### Scenario 1: New User

```
User: Hi there
Bot: Hello! Welcome to our banking assistant! 👋
     
     I can help you check balances, view transactions, and more!
     To get started, you'll need to connect your bank account.
     
     Would you like to connect now?

User: Sure
Bot: 🔗 Let's connect your bank account!
     
     Please enter your 10-digit bank account number.

User: 1234567890
Bot: ✅ Account Found!
     
     John Doe
     First Bank of Nigeria
     
     Please enter your 4-digit PIN to complete the connection.

User: 1234
Bot: 🎉 Success! Your First Bank of Nigeria account has been connected!
     
     Try asking "What's my balance?"

User: What's my balance?
Bot: Your account balances:
     Checking: ₦2,543.12
     Savings: ₦10,234.50
```

### Scenario 2: User Tries Banking Before Connecting

```
User: What's my balance?
Bot: 🔒 You need to connect your bank account first.
     
     Say "connect account" to get started!

User: Connect account
Bot: 🔗 Let's connect your bank account!
     
     Please enter your 10-digit bank account number.
```

### Scenario 3: Connection Errors

```
User: connect my account
Bot: 🔗 Let's connect your bank account!
     
     Please enter your 10-digit bank account number.

User: 123
Bot: ❌ Invalid account number format. 
     Please enter a 10-digit account number.

User: 9999999999
Bot: ❌ Account number not found. Please check and try again.
     
     (2 attempts remaining)

User: cancel
Bot: Connection cancelled. You can start over anytime by saying 
     "connect account".
```

## Migration Path to Real Bank API

When ready to integrate with a real bank:

1. **Update `accountConnectionService.js`**
   - Replace `MOCK_BANK_ACCOUNTS` with API calls
   - Replace `submitAccountNumber()` with real account lookup
   - Replace `submitPin()` with OAuth flow or real verification

2. **Environment Variables**
   ```
   BANK_API_KEY=your_api_key
   BANK_API_SECRET=your_secret
   BANK_API_URL=https://api.bank.com
   ```

3. **Update Mock Functions**
   ```javascript
   // Before (Mock)
   const mockAccount = MOCK_BANK_ACCOUNTS[accountNumber];
   
   // After (Real)
   const response = await fetch(`${BANK_API_URL}/accounts/${accountNumber}`, {
     headers: { 'Authorization': `Bearer ${BANK_API_KEY}` }
   });
   const account = await response.json();
   ```

4. **Test Thoroughly**
   - Test with real accounts in sandbox
   - Verify error handling
   - Check security measures
   - Validate compliance

## Future Enhancements

- [ ] Support for multiple bank accounts per user
- [ ] Bank selection (multiple banks)
- [ ] Account type selection (checking, savings, credit)
- [ ] Biometric verification
- [ ] Email/SMS verification codes
- [ ] Password reset flow
- [ ] Account linking via OAuth
- [ ] Real-time balance updates
- [ ] Push notifications for transactions

## Support

For questions or issues with the account connection flow:

1. Check error logs in console
2. Verify user state in database
3. Test with mock accounts
4. Review conversation history
5. Check rate limiting

## Related Files

- `src/services/accountConnectionService.js` - Core connection logic
- `src/services/webhookService.js` - Handles connection flow in conversations
- `src/services/aiService.js` - AI prompts and function definitions
- `src/models/User.js` - User model with connection fields
- `tests/test-account-connection.js` - Automated tests
