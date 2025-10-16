# whatsappai (prototype)

This repository contains an AI-powered WhatsApp banking assistant. It uses Groq AI for natural language understanding and can connect to real banks via APIs.

## ✨ Features

- 🤖 **AI-Powered Conversations** - Natural language chat powered by Groq
- 💬 **Multi-turn Conversations** - Remembers context across messages
- 🏦 **Banking Functions** - Check balance, view transactions, transfer money
- 🔒 **Transaction Confirmation** - Explicit confirmation required for transfers
- 📊 **Conversation Memory** - Stores last 10 messages for context
- 🇳🇬 **Nigerian Naira Support** - Built for Nigerian banking

## Quick start

1. Install dependencies

```bash
npm install
```

2. Set up MongoDB

Option A - Local MongoDB:
```bash
# Install MongoDB locally or use Docker:
docker run --name whatsapp-mongo -p 27017:27017 -d mongo:latest
```

Option B - Docker Compose (recommended):
```bash
docker-compose up -d mongodb
```

Option C - MongoDB Atlas (cloud):
Create a free cluster at https://mongodb.com/atlas and use the connection string in your `.env`

3. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your settings:
# - MongoDB URI
# - WhatsApp API credentials  
# - Groq API key (get free key from https://console.groq.com)
```

**Important**: Get your Groq API key:
1. Visit https://console.groq.com
2. Sign up (free, no credit card)
3. Create API key
4. Add to `.env`: `GROQ_API_KEY=gsk_your_key_here`

4. Test the AI integration

```bash
npm run test:ai
```

5. Run locally

```bash
npm start
```

6. Test with natural language

Try sending these messages to your WhatsApp bot:
- "What's my balance?"
- "Show me last week's transactions"
- "Transfer 5000 naira to savings"
- "How much did I spend this month?"

The bot understands natural language and remembers conversation context!

## Testing

```bash
# Test AI integration
npm run test:ai

# Test MongoDB
npm run test:mongodb

# Test webhook
npm test

# Run all tests
npm run test:all
```

## Testing from WhatsApp (production)

1. Send a POST to the webhook

```bash
curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"from":"+1555123456","text":"What is my balance?"}'
```

The server will return a JSON reply with the AI-generated response.

## Testing from WhatsApp (quick)

1. Install ngrok and expose your local server:

```bash
ngrok http 3000
```

2. Copy the https URL ngrok prints (for example `https://abcd-1234.ngrok.io`) and set your webhook in the WhatsApp Cloud API developer console to `https://abcd-1234.ngrok.io/webhook`.

3. When asked for a verify token, set `WHATSAPP_VERIFY_TOKEN` in your `.env` to the same value and restart the server.

4. Send messages to your WhatsApp Business number. The webhook will receive them and the adapter will simulate replies unless you set `WHATSAPP_API_TOKEN` and `WHATSAPP_API_URL` to call the real API.

Convenience npm scripts

You can use the included npm scripts to manage tunnels without installing ngrok globally:

```bash
# set your ngrok authtoken (runs `npx ngrok authtoken <token>`)
npm run ngrok:authtoken -- 2EOKPeN90TLtQFAZ50snuQQVGA4_22YN6e5hnuBnBFCGoUmgp

# start ngrok tunnel
npm run ngrok

# or use localtunnel (no signup)
npm run tunnel
```

Security note: never commit your authtoken or WhatsApp API tokens into source control. Use `.env` and a secrets manager for production.

Project layout

- `index.js` - app entry and route mounting
- `src/routes` - express routes
- `src/controllers` - controllers that validate requests
- `src/services` - business logic and adapters
- `src/repositories` - MongoDB persistence layers
- `src/models` - Mongoose schemas for MongoDB
- `src/config` - database connection and configuration
- `docker-compose.yml` - MongoDB container setup

MongoDB Setup

The app now uses MongoDB for persistent data storage instead of in-memory storage.

Quick setup with Docker:
```bash
# Start MongoDB container
npm run mongodb:start

# Test the connection
npm run test:mongodb

# View MongoDB logs
npm run mongodb:logs

# Stop MongoDB
npm run mongodb:stop
```

Manual MongoDB setup:
```bash
# Local MongoDB installation
# Windows: Download from https://www.mongodb.com/try/download/community
# Mac: brew install mongodb-community
# Linux: Follow official installation guide

# Or use Docker directly:
docker run --name whatsapp-mongo -p 27017:27017 -d mongo:latest
```

Production considerations:
- Use MongoDB Atlas for cloud hosting
- Set up proper authentication (see docker-compose.yml)
- Configure backup and monitoring
- Use replica sets for high availability

Next steps

- Replace mock repositories with real connectors (Okra for Nigerian banks, Plaid for US/EU)
- See `ARCHITECTURE.md` for full system architecture and roadmap
- Check `docs/PHASE1-COMPLETE.md` for AI integration details
- Check `docs/PHASE1-QUICKSTART.md` for quick setup guide
- Add OTP and enhanced authentication flows
- Implement bill payment and advanced features

## Phase 1: AI Integration ✅

**What's New:**
- Natural language understanding with Groq AI
- Function calling for banking operations
- Conversation memory (remembers last 10 messages)
- Transaction confirmation flow
- Multi-turn conversations

**Documentation:**
- `docs/PHASE1-COMPLETE.md` - Full Phase 1 documentation
- `docs/PHASE1-QUICKSTART.md` - 5-minute setup guide
- `ARCHITECTURE.md` - Complete system architecture

## Project Structure

- `index.js` - app entry and route mounting
- `src/routes` - express routes
- `src/controllers` - controllers that validate requests
- `src/services` - business logic and AI integration
  - `aiService.js` - Groq AI with function calling (NEW)
  - `conversationService.js` - Conversation memory (NEW)
  - `webhookService.js` - Message processing (UPDATED)
  - `bankService.js` - Banking operations
- `src/repositories` - MongoDB persistence layers
- `src/models` - Mongoose schemas
  - `Session.js` - Now includes conversation history (UPDATED)
  - `User.js` - User data
- `src/config` - database connection
- `src/utils` - WhatsApp adapter
- `docs/` - Phase documentation (NEW)
- `docker-compose.yml` - MongoDB container setup

## Architecture

See `ARCHITECTURE.md` for complete system architecture including:
- AI integration strategy
- Bank connection options (Okra, Plaid, Mono)
- 4-phase implementation roadmap
- Security best practices
- Cost estimates
- Deployment guide

# Project-Eureka
