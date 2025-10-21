Project Overview — WhatsApp Banking Assistant (Project-Eureka)

Date: October 20, 2025
Prepared for: Product Manager
Prepared by: Engineering

---

## High-level summary
Project-Eureka is a prototype WhatsApp-based banking assistant that uses a large language model (Groq / Llama) to provide conversational banking features. It supports a natural, guided account connection flow (mocked), balance checks, transaction viewing, transfers (mocked confirmation flow), spending insights, and general banking Q&A. The system is modular so the mock bank integration can be replaced with a real bank API later.

## Goals
- Provide a natural conversational interface on WhatsApp for banking tasks.
- Ensure sensitive actions only occur when the user bank account is connected.
- Mock the bank integration initially to enable testing and UX validation.
- Keep system architecture modular for easy replacement with Mono / Okra / Plaid.

## What we built (end-to-end)

1. Messaging endpoint and routing
   - `index.js` exposes a webhook endpoint that receives WhatsApp messages.
   - `src/controllers/webhookController.js` handles incoming HTTP events and routes them to the service layer.

2. Session & user management
   - `src/repositories/sessionRepository.js` stores session state (conversation history, pending transactions).
   - `src/repositories/userRepository.js` manages user records (userId, phoneNumber, connection state).
   - `src/models/User.js` updated to include connection fields:
     - `bankAccountConnected` (Boolean)
     - `bankAccountId` (String)
     - `bankConnectionDate` (Date)
     - `connectionState` (temporary state during onboarding)

3. Conversation management
   - `src/services/conversationService.js` manages conversation history, trimming, and formatting for AI.
   - Prevents stale context beyond 30 minutes and limits history size.

4. AI Service (Groq)
   - `src/services/aiService.js` integrates with Groq (llama-3.3) for chat completions.
   - Tool schemas (functions) the model can call:
     - `check_account_status`, `initiate_account_connection`, `check_balance`, `get_transactions`, `transfer_money`, `get_spending_insights`.
   - System prompt instructs the model to call functions silently (never expose function syntax to users).
   - `generateResponseFromFunction()` converts function results into a system message so the model can generate natural responses.

5. Bank service (mock)
   - `src/repositories/mockBankRepository.js` stores test accounts and transactions.
   - `src/services/bankService.js` provides sanitized access to mock data.
   - Test accounts included (example: 1111222233 / PIN 9999).

6. Account connection flow (mocked)
   - `src/services/accountConnectionService.js` implements a multi-step, stateful connection flow:
     - Initiate → request account number (10 digits) → request 4-digit PIN → verify → mark user connected.
     - Session expiration (10 minutes) and attempt limits (3 attempts).
     - Supports cancel and disconnect.
   - Stores temporary `connectionState` on the `User` model.

7. Webhook orchestration & guards
   - `src/services/webhookService.js` is the orchestration layer:
     - Rate limiting per user
     - Routes messages to the AI service
     - Intercepts AI function calls and executes them
     - Ensures banking functions check `bankAccountConnected` before proceeding
     - Handles transfer confirmations via `pendingTransaction` in session

8. WhatsApp adapter
   - `src/utils/whatsappAdapter.js` sends outgoing messages via WhatsApp API (with retries).
   - Note: some logs show WhatsApp permission errors (OAuthException code 10) — operational token/permission issue.

9. Tests & docs
   - `tests/test-account-connection.js` — end-to-end script for the mock connection flow (12 tests)
   - Docs: `docs/ACCOUNT-CONNECTION-FLOW.md`, `docs/NEW-ACCOUNT-CONNECTION.md`, `docs/GROQ-API-FIX.md`, etc.

## Implementation details & notable decisions
- Function calling: LLM decides when to call functions. System prompt enforces silent function calls to avoid leaking technical syntax to users.
- Function result handling: function results are injected as system messages for the model to generate natural responses (avoids Groq API validation errors).
- Session design: conversation history trimmed to keep prompt size reasonable; 30-minute timeout for stale conversations.
- Security: prototype validates formats and limits attempts. For production, replace PIN flow with OAuth / tokenized linking and encrypt stored sensitive data.

## How to test locally
1. Install dependencies

```bash
npm install
```

2. Start MongoDB locally (or set `MONGODB_URI`)
3. Start the app

```bash
npm run dev
```

4. Run the account connection tests

```bash
node tests/test-account-connection.js
```

5. Simulate WhatsApp messages by sending to the webhook endpoint or using the test harness.

## Known issues / operational notes
- WhatsApp API permission errors appeared in logs (OAuthException code 10). Ensure valid tokens and permissions.
- Ensure `GROQ_API_KEY` is set in environment to enable Groq AI; otherwise the service uses fallback intents.
- For production, remove mock repository and integrate with a bank API provider. Store tokens/credentials securely.

## Next steps / roadmap
- Integrate with a real bank API (Mono/Okra/Plaid) using a secure OAuth/linking flow.
- Add token encryption and run security audits.
- Expand tests and add sandbox integration tests with a bank API.
- Improve NLU for more complex multi-intent dialogs and slot-filling.
- Add analytics/event tracking for user flows.

## Quick file map
- `index.js` — server entry
- `src/controllers/webhookController.js` — HTTP layer
- `src/services/webhookService.js` — orchestration and function execution
- `src/services/aiService.js` — Groq integration and system prompt
- `src/services/accountConnectionService.js` — account connection flow
- `src/services/bankService.js` — bank interface (mock)
- `src/repositories/mockBankRepository.js` — mock data
- `src/repositories/sessionRepository.js` — session storage
- `src/repositories/userRepository.js` — user CRUD
- `src/models/User.js` — user schema (connection fields)
- `src/services/conversationService.js` — conversation helpers
- `src/utils/whatsappAdapter.js` — outbound WhatsApp calls
- `tests/test-account-connection.js` — test script

---

If you want, I can also convert this Markdown into a Google Docs document layout (title, headings) or produce a slide deck. Tell me which format you prefer.