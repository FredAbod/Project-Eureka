# Eureka Fintech - Web API Documentation

> **For Frontend Developers**  
> API reference for web authentication and chat functionality

---

## Base URL

```
Production: https://api.eureka.ng
Development: http://localhost:3000
```

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens expire after **1 hour**. Use the refresh endpoint to obtain new tokens.

---

## Endpoints Overview

| Endpoint            | Method | Auth | Description      |
| ------------------- | ------ | ---- | ---------------- |
| `/api/auth/signup`  | POST   | ❌   | Create account   |
| `/api/auth/login`   | POST   | ❌   | Login            |
| `/api/auth/refresh` | POST   | ❌   | Refresh tokens   |
| `/api/auth/logout`  | POST   | ✅   | Logout           |
| `/api/auth/me`      | GET    | ✅   | Get profile      |
| `/api/chat/message` | POST   | ✅   | Send message     |
| `/api/chat/history` | GET    | ✅   | Get chat history |

---

## Authentication Endpoints

### POST `/api/auth/signup`

Create a new user account.

**Request:**

```json
{
  "phoneNumber": "+2348012345678",
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePass123!"
}
```

**Password Requirements:**

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (!@#$%^&\*(),.?":{}|<>)

**Response (201):**

```json
{
  "success": true,
  "data": {
    "userId": "64abc...",
    "phoneNumber": "+2348012345678"
  }
}
```

**Errors:**
| Code | Error | Meaning |
|------|-------|---------|
| 400 | `validation_failed` | Invalid input (check `details` array) |
| 400 | `registration_failed` | Account already exists (generic for security) |
| 429 | `too_many_signups` | Rate limit: 3 per hour |

---

### POST `/api/auth/login`

Authenticate and receive tokens.

**Request:**

```json
{
  "identifier": "+2348012345678",
  "password": "SecurePass123!"
}
```

> Note: `identifier` can be phone number OR email

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": 3600
  }
}
```

**Token Storage:**

> ⚠️ **SECURITY**: Do NOT store tokens in `localStorage` (XSS vulnerable).  
> Store in memory only, or use httpOnly cookies.

**Errors:**
| Code | Error | Meaning |
|------|-------|---------|
| 401 | `invalid_credentials` | Wrong password or user not found |
| 429 | `account_locked` | Too many failed attempts (wait 15 min) |
| 429 | `too_many_attempts` | Rate limit: 5 per 15 minutes |

---

### POST `/api/auth/refresh`

Get new tokens using refresh token.

**Request:**

```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": 3600
  }
}
```

> Note: This implements **token rotation**. The old refresh token is invalidated.

**Errors:**
| Code | Error | Meaning |
|------|-------|---------|
| 401 | `refresh_token_expired` | Refresh token expired (7 days) |
| 401 | `invalid_token` | Invalid or reused token |

---

### POST `/api/auth/logout`

Invalidate session.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200):**

```json
{
  "success": true
}
```

---

### GET `/api/auth/me`

Get current user profile.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "name": "John Doe",
    "phoneNumber": "+2348012345678",
    "email": "user@example.com",
    "preferences": {
      "language": "en",
      "notifications": true
    },
    "hasLinkedAccounts": true,
    "createdAt": "2026-01-29T12:00:00.000Z"
  }
}
```

---

## Chat Endpoints

### POST `/api/chat/message`

Send a message to the AI banking assistant.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Request:**

```json
{
  "message": "What's my balance?"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "response": "Your current balance is ₦45,320 in your checking account.",
    "timestamp": "2026-01-29T12:30:00Z",
    "requiresConfirmation": false
  }
}
```

**Transfer Confirmation Response:**

```json
{
  "success": true,
  "data": {
    "response": "Transfer ₦10,000 from checking to savings? Reply \"confirm\" or \"cancel\".",
    "timestamp": "2026-01-29T12:30:00Z",
    "requiresConfirmation": true,
    "pendingAction": {
      "type": "transfer",
      "amount": 10000,
      "from": "checking",
      "to": "savings",
      "expiresIn": 300
    }
  }
}
```

**Special Actions:**
| Action | Meaning |
|--------|---------|
| `connection_required` | User needs to connect bank account first |
| `connection_initiated` | Bank connection flow started |

**Rate Limit:** 20 messages per minute

---

### GET `/api/chat/history`

Get conversation history.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Max messages (1-100) |
| `before` | string | - | Cursor for pagination |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "role": "user",
        "content": "Check my balance",
        "timestamp": "2026-01-29T12:30:00Z"
      },
      {
        "role": "assistant",
        "content": "Your balance is ₦45,320",
        "timestamp": "2026-01-29T12:30:01Z"
      }
    ],
    "hasMore": false,
    "nextCursor": null
  }
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "error_code",
  "details": []
}
```

**Common Errors:**
| Code | Error | Description |
|------|-------|-------------|
| 400 | `validation_failed` | Input validation failed |
| 401 | `authentication_required` | Missing auth token |
| 401 | `token_expired` | Access token expired |
| 401 | `invalid_token` | Malformed or invalid token |
| 429 | `too_many_requests` | Rate limit exceeded |
| 500 | `internal_error` | Server error |

---

## Security Notes

1. **Tokens**: Store access tokens in memory only
2. **Refresh**: Refresh tokens are single-use (rotation)
3. **Rate Limits**: Respect rate limiting headers
4. **HTTPS**: Always use HTTPS in production
5. **Sensitive Data**: Minimal data returned in responses

---

## Example: Full Authentication Flow

```javascript
// 1. Signup
const signup = await fetch("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    phoneNumber: "+2348012345678",
    email: "user@example.com",
    name: "John Doe",
    password: "SecurePass123!",
  }),
});

// 2. Login
const login = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    identifier: "+2348012345678",
    password: "SecurePass123!",
  }),
});
const { accessToken, refreshToken } = (await login.json()).data;

// 3. Chat
const chat = await fetch("/api/chat/message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ message: "What's my balance?" }),
});

// 4. Refresh when token expires
const refresh = await fetch("/api/auth/refresh", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ refreshToken }),
});
const newTokens = (await refresh.json()).data;
```

---

## WhatsApp Sync

Users can seamlessly switch between web and WhatsApp:

- Same phone number links both channels
- Conversation context is shared
- Bank account connections work on both

To use WhatsApp: Message the Eureka bot on WhatsApp with the same phone number.
