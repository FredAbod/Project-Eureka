# 🚀 Quick Start: Testing Mono Integration

## Prerequisites
1. MongoDB running
2. `.env` file configured with Mono keys
3. Server dependencies installed

## Step-by-Step Testing

### 1. Install Dependencies (if not done)
```bash
npm install node-fetch
```

### 2. Start Your Server
```bash
npm start
```

You should see:
```
✅ Connected to MongoDB
whatsappai prototype (MVC) listening on http://localhost:3000
```

### 3. Run the Test Script
```bash
node tests/testMono.js
```

This will:
- ✅ Check your environment variables
- ✅ Fetch list of supported Nigerian banks
- ✅ Generate a Mono Connect URL

### 4. Test Account Linking (Manual)

Copy the Mono Connect URL from the test output and open it in your browser.

**Test Credentials (Sandbox):**
- Username: `test`
- Password: `test`

Select any bank (GTBank, Access Bank, etc.) and complete the linking.

### 5. Complete the Test

After linking, you'll be redirected to a URL like:
```
http://localhost:3000/api/mono/callback?code=code_abc123xyz
```

Copy the `code` parameter and run:
```bash
node tests/testMono.js code_abc123xyz
```

This will:
- ✅ Exchange the code for an Account ID
- ✅ Fetch account details
- ✅ Show your balance and account info

### 6. Test via API (Postman/cURL)

**Get supported banks:**
```bash
curl http://localhost:3000/api/mono/banks
```

**Initiate account linking:**
```bash
curl -X POST http://localhost:3000/api/mono/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "2348012345678",
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

**Link account (after getting code from Mono):**
```bash
curl -X POST http://localhost:3000/api/mono/link-account \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_CODE_HERE",
    "phoneNumber": "2348012345678"
  }'
```

**Get linked accounts:**
```bash
curl "http://localhost:3000/api/mono/accounts?phoneNumber=2348012345678"
```

**Get balance (replace ACCOUNT_ID with your account ID):**
```bash
curl http://localhost:3000/api/mono/balance/ACCOUNT_ID
```

**Get transactions:**
```bash
curl http://localhost:3000/api/mono/transactions/ACCOUNT_ID
```

---

## Expected Results

### ✅ Success Indicators:
- Test script shows "✅ Retrieved X banks"
- Mono Connect URL opens successfully
- Account linking completes without errors
- Balance and transactions are retrieved
- All API endpoints return `"success": true`

### ❌ Common Issues:

**"MONO_SECRET_KEY not set"**
- Create `.env` file from `.env.example`
- Add your Mono keys

**"Failed to fetch banks"**
- Check internet connection
- Verify Mono API keys are correct
- Check Mono status: https://status.withmono.com

**"Account not found"**
- Complete account linking first
- Check that MongoDB saved the account
- Verify the account ID is correct

**"Invalid code"**
- Codes expire after 5 minutes
- Generate a new Mono Connect URL
- Complete linking process again

---

## Next Steps

Once testing is successful:

1. **Integrate with WhatsApp Bot**
   - Add banking commands to your message handler
   - See `docs/MONO-INTEGRATION-GUIDE.md` for examples

2. **Add More Features**
   - Transaction search
   - Account switching
   - Bill payments (coming soon)
   - Fund transfers (coming soon)

3. **Security Hardening**
   - Add user authentication
   - Encrypt sensitive data
   - Implement rate limiting
   - Add audit logging

4. **Production Preparation**
   - Switch to live Mono keys
   - Set up HTTPS
   - Deploy to cloud (Heroku, AWS, etc.)
   - Complete Mono KYC verification

---

## Resources

- **Full Integration Guide:** `docs/MONO-INTEGRATION-GUIDE.md`
- **Mono Documentation:** https://docs.mono.co
- **Mono Dashboard:** https://app.withmono.com
- **Test Credentials:** https://docs.mono.co/docs/test-credentials

---

## Quick Commands Cheat Sheet

```bash
# Start server
npm start

# Run tests
node tests/testMono.js

# Test with code
node tests/testMono.js code_abc123

# Get banks
curl http://localhost:3000/api/mono/banks

# Check health
curl http://localhost:3000/health
```

---

**Need help?** Check `docs/MONO-INTEGRATION-GUIDE.md` for troubleshooting! 🚀
