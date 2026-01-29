# Frontend Integration Guide: Eureka AI Chat

This document outlines how to optimally integrate the Eureka AI Chat API into your frontend application.

## 1. Authentication Flow

Your frontend must handle two tokens: `accessToken` (short-lived) and `refreshToken` (long-lived).

### Best Practices for Security

> [!WARNING]
> **DO NOT store tokens in localStorage.** Use an in-memory variable for the `accessToken` and manage the `refreshToken` via secure storage or `httpOnly` cookies if possible.

## 2. Core Chat API

### Sending a message

**Endpoint:** `POST /api/chat/message`  
**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**

```json
{
  "message": "What is my balance?"
}
```

**Optimal Response Handling:**
The API returns a structured object. You MUST handle the `action` field to trigger UI changes.

```json
{
  "success": true,
  "data": {
    "response": "Please use this link to securely connect your bank account...",
    "action": "connection_initiated", // 👈 Trigger a "Connect" button/modal
    "timestamp": "2024-01-29T...",
    "requiresConfirmation": false
  }
}
```

### Action Flags Table

| Action Flag            | UI Recommendation                                                      |
| :--------------------- | :--------------------------------------------------------------------- |
| `connection_required`  | Show a "Connect Bank Account" CTA button prominently.                  |
| `connection_initiated` | The response message contains a URL. Extract it and open in a new tab. |
| `transfer_initiated`   | Show a "Confirm Transfer" UI overlay instead of just text.             |

## 3. Optimizing the Chat UI

### Handle States

1. **Initial State**: Check `GET /api/chat/history`. If empty, send a "Hi" on behalf of the user to trigger the AI's warm greeting.
2. **Typing Indicator**: Show a typing indicator immediately after the user sends a message. The AI takes ~1-3s to respond.
3. **Empty History**: If a user is new, the bot will automatically prompt for Mono connection.

### Polling / Refreshing

The `Session` model handles the sync between WhatsApp and Web. If a user connects their account via the Mono link:

1. **Redirection**: The backend will redirect the user back to `MONO_REDIRECT_URL` (e.g., `http://localhost:3000/chat`) with the following query parameters:
   - `status`: `success` or `failed`
   - `message`: Descriptive message of the result
   - `accountId`: The linked Mono Account ID (on success)
2. **Frontend Handling**:
   - Check for these query parameters on page load.
   - If `status=success`, show a success toast and refresh the user's linked accounts list.
   - If `status=failed`, show an error toast with the `message`.
3. **Visibility Sync**: Use a **Visibility Change** event or **Focus** event on the browser window to refresh the chat history. This ensures the bot can say "Thanks! I see you've connected" once the user returns from the Mono pop-up.

## 4. Error Handling

- **401 Unauthorized**: Redirect to login page.
- **429 Too Many Requests**: Show "You are messaging too fast. Please wait a moment."
- **503 Service Busy**: AI capacity reached. Show "I'm a bit busy right now, please try again in a few seconds."

## 5. Security Checklist

- [ ] Sanitize messages before rendering (prevent XSS).
- [ ] Use `rel="noopener noreferrer"` for external Mono links.
- [ ] Encrypt localized storage if caching messages for offline view.

🛡️ Vulnerabilities Found / Risks
No Field-Level Encryption: While the whole DB might be encrypted at rest, sensitive fields like refreshTokenHash are only hashed.
Recommendation: Use Mongoose encryption plugins to encrypt the phoneNumber and email fields specifically.
Security Checklist for Production
Implement httpOnly cookies.
Add CORS whitelist for production domains only.
Enable Mongoose Field-Level Encryption.
Setup Sentry for security event monitoring.
Implement PII scrubbing in chat history.
