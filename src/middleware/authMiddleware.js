/**
 * Authentication Middleware
 * Verifies JWT tokens and enriches requests with user data
 *
 * SECURITY: Minimal data exposure, generic error messages
 */

const { verifyToken } = require("../utils/tokenUtils");
const { logSecurityEvent } = require("./auditLogger");

/**
 * Authenticate request with JWT Bearer token
 * Adds req.user with { userId, phoneNumber } on success
 */
async function authenticate(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "authentication_required",
      });
    }

    // Validate Bearer format
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        error: "invalid_token_format",
      });
    }

    const token = parts[1];

    // Verify token
    const payload = verifyToken(token);

    // Ensure it's an access token, not refresh token
    if (payload.type !== "access") {
      return res.status(401).json({
        success: false,
        error: "invalid_token_type",
      });
    }

    // Enrich request with user data (minimal exposure)
    req.user = {
      userId: payload.sub,
      phoneNumber: payload.phone,
    };

    next();
  } catch (error) {
    // Log security event for monitoring
    logSecurityEvent({
      severity: error.message === "token_expired" ? "low" : "medium",
      event: "auth_failure",
      ip: req.ip,
      details: {
        reason: error.message,
        endpoint: req.originalUrl,
      },
    });

    // Generic error message - don't reveal internal details
    if (error.message === "token_expired") {
      return res.status(401).json({
        success: false,
        error: "token_expired",
      });
    }

    return res.status(401).json({
      success: false,
      error: "invalid_token",
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that work for both authenticated and anonymous users
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  // If token provided, validate it
  return authenticate(req, res, next);
}

module.exports = {
  authenticate,
  optionalAuth,
};
