/**
 * Request Validation Schemas
 * Zod schemas for input validation - fintech-grade security
 */

const { z } = require("zod");

// Phone number validation (E.164 format)
const phoneNumberSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{1,14}$/,
    "Invalid phone number format. Use E.164 format (e.g., +2348012345678)",
  );

// Password schema with complexity requirements
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*(),.?":{}|<>]/,
    "Password must contain at least one special character",
  );

// Email schema
const emailSchema = z
  .string()
  .email("Invalid email format")
  .max(255, "Email must not exceed 255 characters")
  .transform((val) => val.toLowerCase());

// Signup request schema
const signupSchema = z.object({
  phoneNumber: phoneNumberSchema,
  email: emailSchema,
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name contains invalid characters"),
  password: passwordSchema,
});

// Login request schema
const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, "Identifier is required")
    .max(255, "Identifier too long"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password too long"),
});

// Refresh token request schema
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Chat message schema
const chatMessageSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(4096, "Message must not exceed 4096 characters"),
});

// Chat history query schema
const chatHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().min(1).max(100)),
  before: z.string().optional(),
});

/**
 * Validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - 'body' | 'query' | 'params'
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    try {
      const data =
        source === "body"
          ? req.body
          : source === "query"
            ? req.query
            : req.params;

      const result = schema.safeParse(data);

      if (!result.success) {
        // Flatten errors for response
        const errors = result.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        return res.status(400).json({
          success: false,
          error: "validation_failed",
          details: errors,
        });
      }

      // Replace with validated/transformed data
      if (source === "body") {
        req.body = result.data;
      } else if (source === "query") {
        req.query = result.data;
      }

      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
      });
    }
  };
}

module.exports = {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  chatMessageSchema,
  chatHistoryQuerySchema,
  validate,
  phoneNumberSchema,
  passwordSchema,
  emailSchema,
};
