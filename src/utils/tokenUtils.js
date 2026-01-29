/**
 * Token Utilities
 * JWT generation and verification for web authentication
 *
 * SECURITY: Tokens contain minimal payload, short expiry for access tokens
 */

const crypto = require("crypto");
const securityConfig = require("../config/security");

// Simple JWT implementation without external dependency
// Uses HMAC-SHA256 for signing

const JWT_SECRET = securityConfig.getJwtSecret();
const ACCESS_TOKEN_EXPIRY = securityConfig.ACCESS_TOKEN_EXPIRY || 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY = securityConfig.REFRESH_TOKEN_EXPIRY || 604800; // 7 days

/**
 * Base64URL encode (JWT-safe)
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
  // Add back padding
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf8");
}

/**
 * Create HMAC-SHA256 signature
 */
function createSignature(headerPayload) {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(headerPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Generate a JWT token
 * @param {Object} payload - Token payload data
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {string} JWT token
 */
function generateToken(payload, expiresIn) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded payload or throws error
 */
function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("invalid_token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_token_format");
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // Verify signature (constant-time comparison)
  const expectedSignature = createSignature(
    `${encodedHeader}.${encodedPayload}`,
  );
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("invalid_signature");
  }

  // Decode payload
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (e) {
    throw new Error("invalid_payload");
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("token_expired");
  }

  return payload;
}

/**
 * Generate access token for authenticated user
 * @param {string} userId - User's MongoDB ID
 * @param {string} phoneNumber - User's phone number
 * @returns {Object} Token and expiry info
 */
function generateAccessToken(userId, phoneNumber) {
  const token = generateToken(
    {
      sub: userId,
      phone: phoneNumber,
      type: "access",
    },
    ACCESS_TOKEN_EXPIRY,
  );

  return {
    token,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Generate refresh token for token renewal
 * @param {string} userId - User's MongoDB ID
 * @returns {Object} Token and expiry info
 */
function generateRefreshToken(userId) {
  // Add random jti (JWT ID) for uniqueness
  const jti = crypto.randomBytes(16).toString("hex");

  const token = generateToken(
    {
      sub: userId,
      type: "refresh",
      jti,
    },
    REFRESH_TOKEN_EXPIRY,
  );

  return {
    token,
    expiresIn: REFRESH_TOKEN_EXPIRY,
    jti,
  };
}

/**
 * Hash refresh token for storage
 * Never store raw refresh tokens in database
 * @param {string} token - Refresh token to hash
 * @returns {string} Hashed token
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
};
