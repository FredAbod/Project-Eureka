/**
 * Chat Routes
 * Web API for chat functionality
 *
 * SECURITY: All endpoints require authentication
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const webChatService = require("../services/webChatService");
const { authenticate } = require("../middleware/authMiddleware");
const {
  chatMessageSchema,
  chatHistoryQuerySchema,
  validate,
} = require("../utils/validationSchemas");

// Rate limiting for chat endpoints
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: {
    success: false,
    error: "too_many_messages",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/chat/message
 * Send a message to the AI assistant
 */
router.post(
  "/message",
  authenticate,
  chatLimiter,
  validate(chatMessageSchema),
  async (req, res) => {
    try {
      const result = await webChatService.processMessage({
        userId: req.user.userId,
        phoneNumber: req.user.phoneNumber,
        message: req.body.message,
        ip: req.ip,
      });

      if (!result.success) {
        const status = result.error === "service_unavailable" ? 503 : 500;
        return res.status(status).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("Chat message route error:", error.message);
      return res.status(500).json({
        success: false,
        error: "internal_error",
      });
    }
  },
);

/**
 * GET /api/chat/history
 * Get conversation history
 */
router.get(
  "/history",
  authenticate,
  validate(chatHistoryQuerySchema, "query"),
  async (req, res) => {
    try {
      const result = await webChatService.getChatHistory({
        phoneNumber: req.user.phoneNumber,
        limit: req.query.limit,
        before: req.query.before,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("Chat history route error:", error.message);
      return res.status(500).json({
        success: false,
        error: "internal_error",
      });
    }
  },
);

module.exports = router;
