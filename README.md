# whatsappai (prototype)

This repository contains a small MVC-style prototype for a WhatsApp banking assistant. It uses an in-memory mock bank and session store so you can run locally without API keys.

Quick start

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
# Edit .env with your MongoDB URI and other settings
```

4. Run locally

```bash
npm start
```

3. Send a POST to the webhook

```bash
curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"from":"+1555123456","text":"balance"}'
```

The server will return a JSON reply containing the simulated WhatsApp response.

Testing from WhatsApp (quick)

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

- Replace mock repositories with real connectors (WhatsApp API, bank API)
- Add OTP and authentication flows
- Add LLM-based NLU behind a deterministic action executor
# Project-Eureka
