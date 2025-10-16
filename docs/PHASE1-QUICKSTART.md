# 🚀 Phase 1 Quick Start Guide

Get your AI-powered WhatsApp banking bot running in 5 minutes!

## Prerequisites

✅ Node.js installed  
✅ MongoDB running  
✅ WhatsApp Business API configured  
✅ Groq API account (free)

---

## Step 1: Get Groq API Key (2 minutes)

1. Visit: https://console.groq.com
2. Sign up (free, no credit card)
3. Click "API Keys" in sidebar
4. Click "Create API Key"
5. Copy the key (starts with `gsk_`)

---

## Step 2: Configure Environment (1 minute)

Add to your `.env` file:

```bash
GROQ_API_KEY=gsk_your_key_here
```

Make sure these are also set:
```bash
NODE_ENV=development
WHATSAPP_TEST_MODE=false
MONGODB_URI=mongodb://localhost:27017/whatsappai
```

---

## Step 3: Test AI Integration (1 minute)

```bash
npm run test:ai
```

✅ Expected: All tests pass (5/5)  
❌ If fails: Check GROQ_API_KEY in .env

---

## Step 4: Start Server (30 seconds)

```bash
npm start
```

Look for:
```
✓ whatsappai prototype listening on http://localhost:3000
✓ MongoDB Connected
```

---

## Step 5: Test from WhatsApp (1 minute)

Send these messages to your bot:

1. **"What's my balance?"**  
   → Should show account balances

2. **"Show me last week's transactions"**  
   → Should show recent transactions

3. **"Transfer 5000 to savings"**  
   → Should ask for confirmation

4. **"How much did I spend?"**  
   → Should analyze spending

---

## 🎉 Success Indicators

### In Server Logs:
```
Processing with AI { from: '+234...', textLength: 23, historySize: 2 }
AI requested function call { function: 'check_balance', args: {...} }
Executing function call { function: 'check_balance', args: {...} }
```

### In WhatsApp:
- Bot responds naturally
- Understands varied phrasing
- Remembers conversation context
- Asks for confirmation on transfers

---

## 🐛 Troubleshooting

### "Groq API not configured"
→ Add GROQ_API_KEY to .env

### "Connection refused"
→ Start server: `npm start`

### Bot doesn't remember context
→ Check MongoDB is running: `npm run mongodb:start`

### Slow responses (first message)
→ Normal! Model loads on first request (~2-3 seconds)

---

## 📋 Quick Commands

```bash
# Test AI integration
npm run test:ai

# Test MongoDB
npm run test:mongodb

# Test webhook
npm test

# Run all tests
npm run test:all

# Start server
npm start

# Start with auto-reload
npm run dev

# Start ngrok tunnel
npm run ngrok
```

---

## 🎯 What Changed from Before?

### Old Way (Hardcoded):
```javascript
if (text.includes('balance')) {
  return getBalance();
}
```

### New Way (AI-Powered):
```javascript
const aiResponse = await aiService.processMessage(text, history);
if (aiResponse.type === 'function_call') {
  executeFunction(aiResponse.function);
}
```

---

## ✅ Phase 1 Complete When:

- [x] Groq API key configured
- [x] All tests pass
- [x] Server starts without errors
- [x] Bot responds to natural language
- [x] Conversation memory works
- [x] Transfer confirmation flow works

---

## 📚 Next Steps

Ready for more? Check out:

- `docs/PHASE1-COMPLETE.md` - Detailed Phase 1 documentation
- `ARCHITECTURE.md` - Full system architecture
- Phase 2: Connect real bank accounts with Okra

---

## 💡 Pro Tips

1. **Test locally first** before exposing via ngrok
2. **Check logs** - they show AI function calls in real-time
3. **Start simple** - test basic queries before complex ones
4. **Use natural language** - the AI understands context
5. **Conversation timeout** - 30 minutes of inactivity clears history

---

## 🆘 Need Help?

```bash
# Check if Groq is working
node -e "console.log(process.env.GROQ_API_KEY ? '✓ API key set' : '✗ API key missing')"

# Test MongoDB connection
npm run test:mongodb

# View server logs
npm start

# Test AI directly
npm run test:ai
```

---

**Ready? Let's go!** 🚀

```bash
npm run test:ai && npm start
```

Then send a message to your WhatsApp bot and watch the magic happen! ✨
