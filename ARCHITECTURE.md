# Agentic Banking WhatsApp Bot - Architecture & Roadmap

## 🎯 Project Vision

Transform this prototype into a production-ready agentic banking assistant powered by AI, enabling users to manage their bank accounts through natural WhatsApp conversations.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        WhatsApp User                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           WhatsApp Cloud API (Meta)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Your Express Server (Webhook)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Conversation Manager (New Service)                   │   │
│  │  - Manages multi-turn conversations                   │   │
│  │  - Stores context in MongoDB Session                  │   │
│  └────────────┬─────────────────────────────────────────┘   │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Groq AI Service (New)                               │   │
│  │  - Intent classification                              │   │
│  │  - Natural language → structured actions              │   │
│  │  - Function calling for banking operations            │   │
│  └────────────┬─────────────────────────────────────────┘   │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Banking Service (Updated)                           │   │
│  │  - Okra/Plaid integration                            │   │
│  │  - Real account data                                  │   │
│  │  - Transaction execution (if enabled)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MongoDB (Session + User Data)                   │
│  - Conversation history                                      │
│  - Bank connection tokens (encrypted)                        │
│  - User preferences & settings                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤖 AI Integration Strategy

### Groq AI with Function Calling

**Why Groq?**
- ⚡ Ultra-fast inference (critical for WhatsApp UX)
- 💰 Cost-effective compared to OpenAI
- 🛠️ Native function calling support
- 🎯 Perfect for structured banking actions

**Recommended Models:**
- `llama-3.3-70b-versatile` - Best for complex conversations
- `mixtral-8x7b-32768` - Fast, good for simple queries

**Architecture Pattern:**
```
User: "Can you transfer $50 to my savings?"
  ↓
Groq AI + Function Calling
  ↓
Function: transfer_money(from="checking", to="savings", amount=50)
  ↓
Confirmation: "Transfer $50 from Checking to Savings? Reply YES to confirm."
  ↓
User: "YES"
  ↓
Execute → Bank API → Success Response
```

**Banking Functions (Tools):**
```javascript
const bankingTools = [
  {
    name: 'check_balance',
    description: 'Get account balance',
    parameters: { account_type: 'string' }
  },
  {
    name: 'get_transactions',
    description: 'Retrieve recent transactions',
    parameters: { account: 'string', days: 'number' }
  },
  {
    name: 'transfer_money',
    description: 'Transfer money between accounts',
    parameters: { 
      from_account: 'string',
      to_account: 'string',
      amount: 'number'
    }
  },
  {
    name: 'pay_bill',
    description: 'Pay bills or merchants',
    parameters: {
      biller: 'string',
      amount: 'number',
      account: 'string'
    }
  },
  {
    name: 'get_spending_insights',
    description: 'Analyze spending patterns',
    parameters: { timeframe: 'string' }
  }
];
```

**Implementation Options:**

**Option A: Groq SDK + Custom Logic** (Recommended for banking)
- More control over banking operations
- Easier to add security guardrails
- Better for compliance and audit trails

**Option B: LangChain + Groq** (Faster setup)
- Pre-built conversation chains
- Built-in memory management
- Good for rapid prototyping

---

## 🏦 Bank Account Connection

### Recommended Providers

#### **Option 1: Okra (Nigeria + Africa) - RECOMMENDED FOR NIGERIA**

**What is it?**
Open banking API for Africa covering Nigerian banks (GTBank, Access, Zenith, UBA, First Bank, etc.)

**Pros:**
- ✅ Nigerian banks coverage
- ✅ CBN approved (compliant)
- ✅ WhatsApp-friendly (low latency)
- ✅ Local support & documentation
- ✅ Mobile-optimized

**Pricing:**
- Free tier for development
- ~₦50-150 per connected account/month in production
- No setup fees

**Supported Banks (Nigeria):**
- Access Bank, GTBank, Zenith, UBA, First Bank, Stanbic, Fidelity, Sterling, Ecobank, Union Bank, Wema, Polaris, etc.

**Integration Flow:**
```javascript
// 1. Initialize Okra
const Okra = require('okra-js');
const okra = new Okra({
  key: process.env.OKRA_PUBLIC_KEY,
  token: process.env.OKRA_SECRET_KEY,
  products: ['auth', 'balance', 'transactions'],
  onSuccess: async (data) => {
    // Store customer_id and account info
    await userRepo.updateUser(phoneNumber, {
      bankConnection: {
        provider: 'okra',
        customerId: data.customer_id,
        accounts: data.accounts,
        connectedAt: new Date()
      }
    });
  }
});

// 2. Get user's balance
const balance = await okra.getBalance(customerId);

// 3. Get transactions
const transactions = await okra.getTransactions(customerId, { from: '2025-01-01' });
```

**Website:** https://okra.ng

---

#### **Option 2: Mono (Nigeria + West Africa)**

**What is it?**
Similar to Okra, Nigeria-focused open banking platform

**Pros:**
- ✅ 20+ Nigerian banks
- ✅ Slightly cheaper than Okra
- ✅ Good developer experience
- ✅ Real-time data sync

**Pricing:**
- Free tier for development
- ~₦30-100 per account/month

**Website:** https://mono.co

---

#### **Option 3: Plaid (US/Canada/Europe)**

**What is it?**
Industry-standard open banking API (global leader)

**Pros:**
- ✅ 12,000+ financial institutions
- ✅ Best security & compliance (PCI, SOC2)
- ✅ Excellent documentation
- ✅ Real-time data

**Cons:**
- ❌ Limited Nigerian bank support
- ❌ More expensive

**Pricing:**
- Free for development
- $0.10-0.25 per account/month in production

**Use case:** If targeting US/European users

**Website:** https://plaid.com

---

#### **Option 4: Mock/Demo API (For Prototype)**

Keep your existing `mockBankRepository` but enhance it:
- Simulate OAuth flow
- Add realistic delays
- Generate fake transaction history
- Good for testing UX before paying for APIs

---

### Bank Connection UX Flow (WhatsApp)

```
User: "Connect my bank account"
  ↓
Bot: "I'll help you connect your bank. Which bank do you use?
     1. GTBank
     2. Access Bank
     3. Zenith Bank
     4. Other..."
  ↓
User: "1"
  ↓
Bot: [Sends Okra authentication link]
     "Click here to securely connect your GTBank account: https://..."
  ↓
User clicks → enters credentials on Okra → grants permission
  ↓
Bot: "✅ Successfully connected your GTBank account!
     - Checking: ₦45,320.50
     - Savings: ₦125,450.00
     
     You can now check balances, view transactions, and more."
```

---

## 📊 Technology Stack

### Current Stack
- ✅ Node.js + Express
- ✅ MongoDB + Mongoose
- ✅ WhatsApp Cloud API
- ✅ Basic security (helmet, rate limiting)

### New Additions (Phase 1-4)

```json
{
  "dependencies": {
    "groq-sdk": "^0.3.0",           // Groq AI integration
    "okra-js": "^2.0.0",            // Okra (or "mono-node" for Mono)
    "zod": "^3.22.0",               // Schema validation
    "winston": "^3.11.0",           // Production logging
    "crypto": "built-in",           // Token encryption
    "jsonwebtoken": "^9.0.0",       // JWT for sessions
    "helmet": "existing",           // Security headers
    "express-rate-limit": "existing" // Rate limiting
  },
  "devDependencies": {
    "jest": "^29.7.0",              // Testing
    "@types/node": "^20.0.0"        // TypeScript (optional)
  }
}
```

---

## 🗓️ Implementation Roadmap

### **Phase 1: Groq AI Integration** (Week 1: 2-3 days)

**Goal:** Replace hardcoded intent detection with AI-powered conversation

**Tasks:**
- [ ] Install Groq SDK (`npm install groq-sdk zod`)
- [ ] Create `src/services/aiService.js` with function calling
- [ ] Define banking tools/functions schema
- [ ] Update `webhookService.js` to call AI service
- [ ] Add conversation context management
- [ ] Test with various natural language queries

**Expected Outcome:**
Users can say:
- "What's my balance?" → AI calls `check_balance()`
- "Show me what I spent last week" → AI calls `get_transactions(days=7)`
- "How much did I spend on food?" → AI analyzes transactions

**Files to Create/Modify:**
```
src/services/aiService.js           (new)
src/services/conversationService.js (new)
src/services/webhookService.js      (update)
src/models/Session.js               (add conversationHistory field)
```

---

### **Phase 2: Bank Connection** (Week 1-2: 3-4 days)

**Goal:** Connect real bank accounts via Okra/Plaid

**Tasks:**
- [ ] Sign up for Okra account (get API keys)
- [ ] Create `src/services/bankConnectionService.js`
- [ ] Add "Connect Bank" intent to AI service
- [ ] Implement OAuth flow (Okra Link)
- [ ] Update User model with bank connection data
- [ ] Encrypt and store bank tokens securely
- [ ] Replace mock data with real Okra API calls
- [ ] Add error handling for API failures

**Expected Outcome:**
Users can:
- Connect their Nigerian bank account
- See real balances and transactions
- AI uses live data for insights

**Files to Create/Modify:**
```
src/services/bankConnectionService.js (new)
src/services/bankService.js           (update - add Okra calls)
src/models/User.js                    (add bankConnection field)
src/utils/encryption.js               (new - for token encryption)
```

**Environment Variables to Add:**
```bash
OKRA_PUBLIC_KEY=your_public_key
OKRA_SECRET_KEY=your_secret_key
ENCRYPTION_KEY=generate_32_byte_key  # for encrypting bank tokens
```

---

### **Phase 3: Conversation Memory** (Week 2: 1-2 days)

**Goal:** Enable multi-turn conversations with context

**Tasks:**
- [ ] Update Session model to store conversation history
- [ ] Implement context window (last 10 messages)
- [ ] Add message threading
- [ ] Handle conversation timeouts
- [ ] Test complex multi-turn scenarios

**Expected Outcome:**
```
User: "What's my balance?"
Bot: "You have ₦45,320 in Checking and ₦125,450 in Savings"
User: "Transfer 10k to savings"  ← AI remembers we're talking about accounts
Bot: "Transfer ₦10,000 from Checking to Savings? Reply YES to confirm."
User: "YES"
Bot: "✅ Transfer complete!"
```

**Files to Create/Modify:**
```
src/services/conversationService.js (update - add memory)
src/models/Session.js               (add conversationHistory array)
src/repositories/sessionRepository.js (add conversation methods)
```

---

### **Phase 4: Security & Compliance** (Week 3: Ongoing)

**Goal:** Production-ready security for banking operations

**Tasks:**
- [ ] Implement token encryption at rest (AES-256)
- [ ] Add transaction confirmation flow (2FA via WhatsApp)
- [ ] Enable webhook signature verification
- [ ] Add comprehensive audit logging (Winston)
- [ ] Implement session timeout (already have 1hr)
- [ ] Add transaction limits and daily caps
- [ ] PCI DSS compliance checklist
- [ ] Add user consent tracking
- [ ] Implement "panic button" (disable account)

**Expected Outcome:**
- Bank tokens encrypted in MongoDB
- All transactions require explicit confirmation
- Full audit trail for compliance
- Rate limiting per user and per action

**Files to Create/Modify:**
```
src/utils/encryption.js           (new)
src/middleware/auditLogger.js     (new)
src/services/confirmationService.js (new - for 2FA)
src/config/security.js            (new)
```

**Security Checklist:**
- [ ] Encrypt bank tokens with AES-256-GCM
- [ ] Use HTTPS only (ngrok does this)
- [ ] Verify WhatsApp webhook signatures
- [ ] Rate limit: 10 requests/min per user (done)
- [ ] Session timeout: 1 hour (done)
- [ ] Log all banking operations
- [ ] Require confirmation for money movement
- [ ] Implement daily transaction limits
- [ ] Add IP allowlisting for sensitive operations
- [ ] Store minimal PII (phone numbers only)

---

### **Phase 5: Advanced Features** (Week 4+)

**Optional enhancements:**
- [ ] Bill payment integration
- [ ] Spending insights & budgeting
- [ ] Transaction categorization (AI-powered)
- [ ] Recurring payment setup
- [ ] Savings goals tracking
- [ ] Multi-language support
- [ ] Voice message support
- [ ] Transaction receipts (PDF via WhatsApp)

---

## 💰 Cost Estimates

### Monthly Costs (1000 Active Users)

| Service | Cost (USD) | Notes |
|---------|------------|-------|
| **Groq API** | $5-20 | Very cheap, pay per token (~$0.27/1M tokens) |
| **Okra** (Nigeria) | $50-150 | ₦50-150 per connected account |
| **Plaid** (US/EU) | $100-250 | $0.10-0.25 per account/month |
| **WhatsApp Business API** | $0-50 | Free first 1000 conversations/month |
| **MongoDB Atlas** | $0-9 | Free tier (512MB) or $9 for 2GB |
| **Ngrok** (dev) | $0-8 | Free or $8/month for static domain |
| **Server Hosting** | $5-20 | DigitalOcean/Heroku/Railway |
| **Total (Nigeria)** | **$60-170** | For 1000 active users |

### Cost Optimization Tips:
- Use free tiers during development
- Groq is 10-20x cheaper than OpenAI
- Okra is cheaper than Plaid for Africa
- MongoDB Atlas free tier is sufficient for 10k users
- WhatsApp gives 1000 free conversations/month

---

## 🔒 Security Best Practices

### Data Encryption
```javascript
// Encrypt bank tokens before storing
const crypto = require('crypto');

function encrypt(text) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// Before saving to MongoDB:
const encryptedToken = encrypt(okraToken);
user.bankConnection.token = encryptedToken;
```

### Transaction Confirmation Flow
```javascript
// Always require explicit confirmation for money movement
if (functionName === 'transfer_money') {
  // Store pending transaction
  session.pendingTransaction = {
    type: 'transfer',
    params: { from, to, amount },
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  };
  
  return {
    text: `🔒 Confirmation Required\n\nTransfer ₦${amount} from ${from} to ${to}?\n\nReply YES to confirm or NO to cancel.\n\n(Expires in 5 minutes)`
  };
}

// On next message
if (text.toUpperCase() === 'YES' && session.pendingTransaction) {
  // Execute the transaction
  await executeTransfer(session.pendingTransaction.params);
  session.pendingTransaction = null;
}
```

### Audit Logging
```javascript
// Log all banking operations
const winston = require('winston');

const auditLogger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ 
      filename: 'audit.log',
      level: 'info'
    })
  ]
});

// Log every banking action
auditLogger.info('Banking Action', {
  userId: session.userId,
  phoneNumber: session.phoneNumber,
  action: 'transfer_money',
  params: { from: 'checking', to: 'savings', amount: 1000 },
  timestamp: new Date().toISOString(),
  ip: req.ip,
  status: 'success'
});
```

---

## 🧪 Testing Strategy

### Unit Tests
```javascript
// Test AI service function calling
describe('AI Service', () => {
  test('should detect transfer intent', async () => {
    const result = await aiService.processMessage(
      'Send 5000 to my savings',
      conversationContext
    );
    expect(result.function).toBe('transfer_money');
    expect(result.params.amount).toBe(5000);
  });
});
```

### Integration Tests
```javascript
// Test end-to-end webhook flow
describe('Webhook Flow', () => {
  test('should handle balance check', async () => {
    const response = await request(app)
      .post('/webhook')
      .send({ from: '+234907...', text: 'balance' });
    
    expect(response.body.reply.text).toContain('₦');
    expect(response.status).toBe(200);
  });
});
```

### Manual Testing Checklist
- [ ] Connect bank account flow
- [ ] Check balance with various phrasings
- [ ] View transactions
- [ ] Transfer money (with confirmation)
- [ ] Handle errors (API down, insufficient funds)
- [ ] Rate limiting behavior
- [ ] Session timeout
- [ ] Multi-turn conversations

---

## 🚀 Deployment

### Recommended Hosting Options

**Option 1: Railway (Easiest)**
- Click deploy from GitHub
- Auto-scaling
- $5-20/month

**Option 2: DigitalOcean App Platform**
- Simple deployment
- $5-12/month for basic app

**Option 3: Heroku**
- Easy to start
- Free tier (with limits)

**Option 4: AWS/Azure (Enterprise)**
- Most control
- More complex setup

### Environment Variables for Production
```bash
NODE_ENV=production
PORT=3000

# WhatsApp
WHATSAPP_API_URL=https://graph.facebook.com/v22.0/...
WHATSAPP_API_TOKEN=your_long_lived_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_WEBHOOK_SECRET=your_webhook_secret

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/whatsappai

# Groq AI
GROQ_API_KEY=your_groq_key

# Okra (or Plaid)
OKRA_PUBLIC_KEY=your_public_key
OKRA_SECRET_KEY=your_secret_key

# Security
ENCRYPTION_KEY=generate_32_byte_hex_key
USER_ID_SALT=random_salt_value
JWT_SECRET=your_jwt_secret

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
```

---

## 📈 Success Metrics

### Key Performance Indicators (KPIs)

**User Engagement:**
- Daily/Monthly active users
- Average messages per user
- Conversation completion rate

**Banking Operations:**
- Bank accounts connected
- Successful balance checks
- Transaction success rate
- Average response time

**AI Performance:**
- Intent classification accuracy
- Function calling success rate
- Conversation resolution rate
- User satisfaction (surveys)

**Technical:**
- API uptime (target: 99.9%)
- Average response time (target: <2s)
- Error rate (target: <1%)

---

## 🆘 Troubleshooting

### Common Issues

**Issue: Groq API timeout**
- Solution: Reduce max_tokens, use faster model, add retry logic

**Issue: Okra connection fails**
- Solution: Check API keys, verify bank is supported, test in sandbox mode

**Issue: WhatsApp not delivering messages**
- Solution: Check token expiration, verify phone number format, check rate limits

**Issue: High costs**
- Solution: Cache AI responses, optimize prompts, use cheaper models for simple queries

---

## 📚 Resources

### Documentation
- **Groq API**: https://console.groq.com/docs
- **Okra Docs**: https://docs.okra.ng
- **Plaid Docs**: https://plaid.com/docs
- **WhatsApp Business API**: https://developers.facebook.com/docs/whatsapp
- **MongoDB**: https://www.mongodb.com/docs

### Example Projects
- **LangChain Banking Bot**: https://github.com/langchain-ai/langchain
- **Plaid Quickstart**: https://github.com/plaid/quickstart
- **Groq Examples**: https://github.com/groq/groq-typescript

---

## 🎯 Quick Decision Guide

### Geography: Nigeria/Africa?
→ **Use Okra** (best coverage, local support)

### Geography: US/Europe?
→ **Use Plaid** (industry standard)

### Budget: <$100/month?
→ **Start with Groq + Okra + Free tiers**

### Timeline: Need it in 2 weeks?
→ **Phase 1-2 only, use mock bank first**

### Security: Handling real money?
→ **Must complete Phase 4 (security) before launch**

---

## ✅ Pre-Launch Checklist

Before going to production:
- [ ] All bank tokens encrypted at rest
- [ ] Transaction confirmations implemented
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Webhook signature verification enabled
- [ ] Error handling for all API calls
- [ ] Session timeout working
- [ ] Load testing completed
- [ ] Security audit done
- [ ] Legal/compliance review (terms of service)
- [ ] Monitoring & alerting set up
- [ ] Backup strategy for MongoDB
- [ ] Customer support process defined

---

## 🤝 Support

For questions or issues during implementation:
1. Check this architecture doc
2. Review API documentation (Groq, Okra, WhatsApp)
3. Test in development environment first
4. Use console logs for debugging
5. Check ngrok inspector for webhook issues

---

**Document Version:** 1.0  
**Last Updated:** October 10, 2025  
**Next Review:** After Phase 2 completion
