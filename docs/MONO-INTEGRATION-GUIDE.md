# Mono Integration Guide

## 🎯 Overview

This guide walks you through integrating Mono.co for real Nigerian bank account aggregation in Project Eureka.

**Status:** ✅ Implementation Complete  
**Environment:** Sandbox/Test Mode  
**Next Steps:** Testing & Integration with WhatsApp Bot

---

## 📁 Files Created

### 1. **Service Layer** (`src/services/monoService.js`)
- Complete Mono API wrapper
- Methods for all banking operations:
  - Account linking/unlinking
  - Balance fetching
  - Transaction history
  - Account sync
  - Identity verification
  - Statement generation

### 2. **Controller Layer** (`src/controllers/monoController.js`)
- HTTP request handlers
- Database operations
- User management
- Error handling

### 3. **Routes** (`src/routes/monoRoutes.js`)
- REST API endpoints
- URL patterns and parameters

### 4. **Models** (`src/models/`)
- `User.js` - User profile with linked accounts
- `BankAccount.js` - Bank account details from Mono

---

## 🔑 Configuration

### Step 1: Set Environment Variables

Copy `.env.example` to `.env` and ensure these are set:

```bash
# Mono API
MONO_PUBLIC_KEY=test_pk_ylrr82nphrx7naa9rl54
MONO_SECRET_KEY=test_sk_a2zqdca3bu0x44umfqxx
MONO_BASE_URL=https://api.withmono.com/v2

# Server
BASE_URL=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/whatsappai
```

### Step 2: Install Dependencies

```bash
npm install node-fetch
```

---

## 🚀 API Endpoints

All endpoints are under `/api/mono`:

### 1. **Initiate Account Linking**
```http
POST /api/mono/initiate
Content-Type: application/json

{
  "phoneNumber": "2348012345678",
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account linking initiated",
  "monoUrl": "https://connect.withmono.com/...",
  "ref": "user_abc123"
}
```

**Usage:** Send this `monoUrl` to the user. They click it to link their bank account.

---

### 2. **Complete Account Linking**
```http
POST /api/mono/link-account
Content-Type: application/json

{
  "code": "code_xyz789",
  "phoneNumber": "2348012345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bank account linked successfully!",
  "account": {
    "id": "account_123",
    "accountNumber": "0123456789",
    "accountName": "John Doe",
    "bankName": "GTBank",
    "balance": 50000,
    "currency": "NGN"
  }
}
```

---

### 3. **Get Linked Accounts**
```http
GET /api/mono/accounts?phoneNumber=2348012345678
```

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "account_123",
      "accountNumber": "0123456789",
      "accountName": "John Doe",
      "bankName": "GTBank",
      "balance": 50000,
      "currency": "NGN",
      "isActive": true,
      "lastSynced": "2025-11-04T10:30:00Z"
    }
  ]
}
```

---

### 4. **Get Account Balance**
```http
GET /api/mono/balance/:accountId
```

**Response:**
```json
{
  "success": true,
  "balance": 50000,
  "currency": "NGN",
  "cached": false,
  "lastSynced": "2025-11-04T10:30:00Z"
}
```

---

### 5. **Get Transaction History**
```http
GET /api/mono/transactions/:accountId?page=1&start=2024-01-01&end=2024-12-31
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn_123",
      "narration": "Transfer from John",
      "amount": 5000,
      "type": "credit",
      "balance": 50000,
      "date": "2024-11-03",
      "category": "transfer"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "hasNext": true
  }
}
```

---

### 6. **Sync Account**
```http
POST /api/mono/sync/:accountId
```

**Response:**
```json
{
  "success": true,
  "message": "Account synced successfully",
  "account": {
    "balance": 52000,
    "lastSynced": "2025-11-04T11:00:00Z"
  }
}
```

---

### 7. **Unlink Account**
```http
DELETE /api/mono/unlink/:accountId
```

**Response:**
```json
{
  "success": true,
  "message": "Account unlinked successfully"
}
```

---

### 8. **Get Supported Banks**
```http
GET /api/mono/banks
```

**Response:**
```json
{
  "success": true,
  "banks": [
    {
      "id": "gtbank",
      "name": "GTBank",
      "code": "058",
      "type": "retail",
      "authMethods": ["internet_banking", "mobile_banking"]
    },
    {
      "id": "access",
      "name": "Access Bank",
      "code": "044",
      "type": "retail",
      "authMethods": ["internet_banking", "mobile_banking"]
    }
  ]
}
```

---

## 🧪 Testing

### Quick Test (Postman/cURL)

1. **Start your server:**
```bash
npm start
```

2. **Test bank list:**
```bash
curl http://localhost:3000/api/mono/banks
```

3. **Initiate account linking:**
```bash
curl -X POST http://localhost:3000/api/mono/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "2348012345678",
    "name": "Test User",
    "email": "test@example.com"
  }'
```

4. **Visit the Mono Connect URL** (from response) and complete linking

5. **Complete linking with the code:**
```bash
curl -X POST http://localhost:3000/api/mono/link-account \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_CODE_FROM_MONO",
    "phoneNumber": "2348012345678"
  }'
```

---

## 🔗 Integration with WhatsApp Bot

### Step 1: Add Banking Commands

In your WhatsApp message handler, add:

```javascript
// src/services/whatsappService.js or similar

const monoService = require('./monoService');
const User = require('../models/User');
const BankAccount = require('../models/BankAccount');

async function handleBankingCommand(message, phoneNumber) {
  const text = message.toLowerCase();

  // Link bank account
  if (text.includes('link account') || text.includes('add bank')) {
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      return "Please register first by sending your name and email.";
    }

    const result = await monoService.initiateAccountLinking(
      { name: user.name, email: user.email },
      `${process.env.BASE_URL}/api/mono/callback`,
      `user_${user._id}`
    );

    if (result.success) {
      return `🏦 Click here to link your bank account:\n\n${result.monoUrl}\n\nOnce linked, reply with: LINKED`;
    } else {
      return "❌ Failed to initiate account linking. Please try again.";
    }
  }

  // Check balance
  if (text.includes('balance') || text.includes('check balance')) {
    const user = await User.findOne({ phoneNumber }).populate('linkedAccounts');
    
    if (!user || user.linkedAccounts.length === 0) {
      return "You don't have any linked accounts. Reply 'link account' to get started.";
    }

    let response = "💰 Your Account Balances:\n\n";
    
    for (const account of user.linkedAccounts) {
      if (!account.isActive) continue;
      
      const balanceResult = await monoService.getBalance(account.monoAccountId);
      
      if (balanceResult.success) {
        response += `${account.bankName}\n`;
        response += `Account: ${account.accountNumber}\n`;
        response += `Balance: ₦${balanceResult.balance.toLocaleString()}\n\n`;
      }
    }

    return response;
  }

  // View transactions
  if (text.includes('transactions') || text.includes('history')) {
    const user = await User.findOne({ phoneNumber }).populate('linkedAccounts');
    
    if (!user || user.linkedAccounts.length === 0) {
      return "You don't have any linked accounts.";
    }

    const account = user.linkedAccounts.find(acc => acc.isActive);
    if (!account) {
      return "No active accounts found.";
    }

    const txResult = await monoService.getTransactions(account.monoAccountId, { page: 1 });
    
    if (!txResult.success || txResult.transactions.length === 0) {
      return "No recent transactions found.";
    }

    let response = `📊 Recent Transactions (${account.bankName}):\n\n`;
    
    txResult.transactions.slice(0, 5).forEach(tx => {
      const emoji = tx.type === 'credit' ? '💚' : '💸';
      response += `${emoji} ${tx.narration}\n`;
      response += `Amount: ₦${Math.abs(tx.amount).toLocaleString()}\n`;
      response += `Date: ${tx.date}\n\n`;
    });

    return response;
  }

  // View all accounts
  if (text.includes('my accounts') || text.includes('show accounts')) {
    const user = await User.findOne({ phoneNumber }).populate('linkedAccounts');
    
    if (!user || user.linkedAccounts.length === 0) {
      return "You don't have any linked accounts.";
    }

    let response = "🏦 Your Linked Accounts:\n\n";
    
    user.linkedAccounts.forEach((account, index) => {
      if (account.isActive) {
        response += `${index + 1}. ${account.bankName}\n`;
        response += `   Account: ${account.accountNumber}\n`;
        response += `   Balance: ₦${account.balance.toLocaleString()}\n\n`;
      }
    });

    return response;
  }

  return null; // Not a banking command
}

module.exports = { handleBankingCommand };
```

---

## 📝 Next Steps

### Week 1: Testing & Refinement
- [ ] Test all API endpoints
- [ ] Test with real Nigerian bank accounts (sandbox)
- [ ] Integrate with WhatsApp bot
- [ ] Add error handling and user-friendly messages

### Week 2: WhatsApp Integration
- [ ] Add "Link Account" command
- [ ] Add "Check Balance" command
- [ ] Add "View Transactions" command
- [ ] Add "My Accounts" command
- [ ] Test end-to-end flow

### Week 3: Advanced Features
- [ ] Multi-account support (let users link multiple banks)
- [ ] Account switching ("Check balance for GTBank")
- [ ] Transaction search ("Show transfers from last month")
- [ ] Account sync automation

### Week 4: Security & Polish
- [ ] Add encryption for sensitive data
- [ ] Implement rate limiting
- [ ] Add audit logging
- [ ] User authentication/verification

---

## 🔐 Security Considerations

1. **Never expose secret key** - Keep `MONO_SECRET_KEY` in `.env`, never commit to Git
2. **Validate all inputs** - Check phoneNumber format, email validity
3. **Use HTTPS in production** - Mono Connect requires HTTPS callback URLs
4. **Encrypt sensitive data** - Consider encrypting account numbers in DB
5. **Implement rate limiting** - Prevent abuse of API endpoints
6. **Add authentication** - Verify user identity before returning account data

---

## 🐛 Troubleshooting

### "MONO_SECRET_KEY not set"
- Ensure `.env` file exists
- Copy from `.env.example` and fill in values
- Restart server after changing `.env`

### "Failed to exchange token"
- Check that code is valid (expires after 5 minutes)
- Verify secret key is correct
- Check Mono dashboard for errors

### "Account not found"
- User must complete linking process first
- Check MongoDB to see if account was saved
- Verify `monoAccountId` is correct

### "Network error"
- Check internet connection
- Verify Mono API is up (https://status.withmono.com)
- Check firewall/proxy settings

---

## 📚 Resources

- **Mono Documentation:** https://docs.mono.co
- **Mono Dashboard:** https://app.withmono.com
- **Mono Status:** https://status.withmono.com
- **API Reference:** https://docs.mono.co/reference

---

## 🎉 Success Checklist

- [x] ✅ Mono service created
- [x] ✅ Controllers implemented
- [x] ✅ Routes configured
- [x] ✅ Models created
- [x] ✅ Environment variables set
- [ ] ⏳ Test with real bank account
- [ ] ⏳ Integrate with WhatsApp bot
- [ ] ⏳ Deploy to production

---

**You're ready to test Mono integration! 🚀🇳🇬**

Start your server and try the test commands above. Once confirmed working, integrate with your WhatsApp bot for a complete banking experience!
