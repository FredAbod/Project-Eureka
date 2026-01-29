/**
 * Authentication Routes
 * Handles user registration, login, token refresh, and logout
 *
 * SECURITY: Rate limited, validated, audit logged
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const authService = require("../services/authService");
const { authenticate } = require("../middleware/authMiddleware");
const {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  validate,
} = require("../utils/validationSchemas");

// Strict rate limiting for auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: "too_many_attempts",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 signups per hour
  message: {
    success: false,
    error: "too_many_signups",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/signup
 * Create a new user account
 */
router.post(
  "/signup",
  signupLimiter,
  validate(signupSchema),
  async (req, res) => {
    try {
      const result = await authService.register({
        ...req.body,
        ip: req.ip,
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      console.error("Signup route error:", error.message);
      return res.status(500).json({
        success: false,
        error: "internal_error",
      });
    }
  },
);

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const result = await authService.login({
      ...req.body,
      ip: req.ip,
    });

    if (!result.success) {
      // Use 401 for auth failures, 429 for lockout
      const status = result.error === "account_locked" ? 429 : 401;
      return res.status(status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Login route error:", error.message);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post("/refresh", validate(refreshTokenSchema), async (req, res) => {
  try {
    const result = await authService.refreshAccessToken(
      req.body.refreshToken,
      req.ip,
    );

    if (!result.success) {
      return res.status(401).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Refresh route error:", error.message);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate user session
 */
router.post("/logout", authenticate, async (req, res) => {
  try {
    await authService.logout(req.user.userId, req.ip);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Logout route error:", error.message);
    // Always return success for logout to prevent enumeration
    return res.status(200).json({
      success: true,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await authService.getProfile(req.user.userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Profile route error:", error.message);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

module.exports = router;
