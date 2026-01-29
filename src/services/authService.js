/**
 * Authentication Service
 * Handles user registration, login, and token management
 *
 * SECURITY NOTES:
 * - Passwords hashed with bcrypt (12 rounds)
 * - Constant-time password comparison
 * - Generic error messages to prevent enumeration
 * - Account lockout after failed attempts
 * - Refresh tokens stored hashed
 */

const bcrypt = require("bcrypt");
const User = require("../models/User");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashToken,
} = require("../utils/tokenUtils");
const { logAuthEvent, logSecurityEvent } = require("../middleware/auditLogger");
const securityConfig = require("../config/security");

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = securityConfig.MAX_LOGIN_ATTEMPTS || 5;
const LOCKOUT_DURATION =
  securityConfig.LOGIN_LOCKOUT_DURATION || 15 * 60 * 1000; // 15 minutes

/**
 * Register a new user
 * @param {Object} userData - { phoneNumber, email, name, password }
 * @returns {Object} Result with userId or error
 */
async function register(userData) {
  const { phoneNumber, email, name, password } = userData;

  try {
    // Check if user already exists (by phone or email)
    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      // Generic error - don't reveal which field exists
      logAuthEvent({
        event: "registration_duplicate",
        phoneNumber,
        status: "failed",
        ip: userData.ip,
        metadata: { reason: "user_exists" },
      });

      return {
        success: false,
        error: "registration_failed",
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const user = await User.create({
      phoneNumber,
      email: email.toLowerCase(),
      name,
      password: hashedPassword,
    });

    logAuthEvent({
      userId: user._id.toString(),
      phoneNumber,
      event: "registration_success",
      status: "success",
      ip: userData.ip,
    });

    // Return minimal data - don't expose internal IDs externally
    return {
      success: true,
      data: {
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
      },
    };
  } catch (error) {
    console.error("Registration error:", error.message);

    logSecurityEvent({
      severity: "medium",
      event: "registration_error",
      phoneNumber,
      ip: userData.ip,
      details: { error: error.message },
    });

    return {
      success: false,
      error: "registration_failed",
    };
  }
}

/**
 * Authenticate user and generate tokens
 * @param {Object} credentials - { identifier (phone/email), password }
 * @returns {Object} Tokens or error
 */
async function login(credentials) {
  const { identifier, password, ip } = credentials;

  try {
    // Find user by phone or email, explicitly select password
    const user = await User.findOne({
      $or: [{ phoneNumber: identifier }, { email: identifier.toLowerCase() }],
    }).select("+password +refreshTokenHash +loginAttempts +lockoutUntil");

    // Check if account is locked
    if (user && user.lockoutUntil && user.lockoutUntil > new Date()) {
      logSecurityEvent({
        severity: "medium",
        event: "login_locked_account",
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
        ip,
        details: { lockoutUntil: user.lockoutUntil },
      });

      return {
        success: false,
        error: "account_locked",
      };
    }

    // If user doesn't exist or no password set (WhatsApp-only user)
    if (!user || !user.password) {
      // Log failed attempt but don't reveal user existence
      logAuthEvent({
        event: "login_failed",
        phoneNumber: identifier,
        status: "failed",
        ip,
        metadata: { reason: "user_not_found_or_no_password" },
      });

      return {
        success: false,
        error: "invalid_credentials",
      };
    }

    // Constant-time password comparison
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Increment login attempts
      const attempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: attempts };

      // Lock account if too many attempts
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        updates.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION);

        logSecurityEvent({
          severity: "high",
          event: "account_locked_attempts",
          userId: user._id.toString(),
          phoneNumber: user.phoneNumber,
          ip,
          details: { attempts, lockoutDuration: LOCKOUT_DURATION },
        });
      }

      await User.updateOne({ _id: user._id }, { $set: updates });

      logAuthEvent({
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
        event: "login_failed",
        status: "failed",
        ip,
        metadata: { reason: "invalid_password", attempts },
      });

      return {
        success: false,
        error: "invalid_credentials",
      };
    }

    // Generate tokens
    const accessToken = generateAccessToken(
      user._id.toString(),
      user.phoneNumber,
    );
    const refreshToken = generateRefreshToken(user._id.toString());

    // Store hashed refresh token and reset login attempts
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          refreshTokenHash: hashToken(refreshToken.token),
          lastLoginAt: new Date(),
          loginAttempts: 0,
          lockoutUntil: null,
        },
      },
    );

    logAuthEvent({
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      event: "login_success",
      status: "success",
      ip,
    });

    return {
      success: true,
      data: {
        accessToken: accessToken.token,
        refreshToken: refreshToken.token,
        expiresIn: accessToken.expiresIn,
      },
    };
  } catch (error) {
    console.error("Login error:", error.message);

    return {
      success: false,
      error: "authentication_failed",
    };
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Current refresh token
 * @returns {Object} New tokens or error
 */
async function refreshAccessToken(refreshToken, ip) {
  try {
    // Verify refresh token
    const payload = verifyToken(refreshToken);

    if (payload.type !== "refresh") {
      return {
        success: false,
        error: "invalid_token_type",
      };
    }

    // Find user and verify stored hash matches
    const user = await User.findById(payload.sub).select("+refreshTokenHash");

    if (!user) {
      return {
        success: false,
        error: "invalid_token",
      };
    }

    // Verify token hash matches stored hash
    const tokenHash = hashToken(refreshToken);
    if (user.refreshTokenHash !== tokenHash) {
      // Token reuse detected - potential theft
      logSecurityEvent({
        severity: "high",
        event: "refresh_token_reuse",
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
        ip,
        details: { message: "Potential token theft detected" },
      });

      // Invalidate all tokens
      await User.updateOne(
        { _id: user._id },
        { $set: { refreshTokenHash: null } },
      );

      return {
        success: false,
        error: "invalid_token",
      };
    }

    // Generate new tokens (token rotation)
    const newAccessToken = generateAccessToken(
      user._id.toString(),
      user.phoneNumber,
    );
    const newRefreshToken = generateRefreshToken(user._id.toString());

    // Update stored refresh token hash
    await User.updateOne(
      { _id: user._id },
      { $set: { refreshTokenHash: hashToken(newRefreshToken.token) } },
    );

    logAuthEvent({
      userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      event: "token_refresh",
      status: "success",
      ip,
    });

    return {
      success: true,
      data: {
        accessToken: newAccessToken.token,
        refreshToken: newRefreshToken.token,
        expiresIn: newAccessToken.expiresIn,
      },
    };
  } catch (error) {
    if (error.message === "token_expired") {
      return {
        success: false,
        error: "refresh_token_expired",
      };
    }

    return {
      success: false,
      error: "invalid_token",
    };
  }
}

/**
 * Logout user by invalidating refresh token
 * @param {string} userId - User ID from JWT
 * @returns {Object} Success status
 */
async function logout(userId, ip) {
  try {
    const user = await User.findById(userId);

    if (user) {
      await User.updateOne(
        { _id: user._id },
        { $set: { refreshTokenHash: null } },
      );

      logAuthEvent({
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
        event: "logout",
        status: "success",
        ip,
      });
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Logout error:", error.message);
    return {
      success: true, // Don't reveal errors on logout
    };
  }
}

/**
 * Get user profile (minimal data)
 * @param {string} userId - User ID from JWT
 * @returns {Object} User profile or error
 */
async function getProfile(userId) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return {
        success: false,
        error: "user_not_found",
      };
    }

    // Return minimal profile data
    return {
      success: true,
      data: {
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        preferences: user.preferences,
        hasLinkedAccounts:
          user.linkedAccounts && user.linkedAccounts.length > 0,
        createdAt: user.createdAt,
      },
    };
  } catch (error) {
    console.error("Get profile error:", error.message);
    return {
      success: false,
      error: "fetch_failed",
    };
  }
}

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  getProfile,
};
