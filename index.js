require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./src/config/database");
const webhookRoutes = require("./src/routes/webhookRoutes");
const monoRoutes = require("./src/routes/monoRoutes");
const authRoutes = require("./src/routes/authRoutes");
const chatRoutes = require("./src/routes/chatRoutes");

// Connect to MongoDB
connectDB();

const app = express();

// Trust proxy for ngrok/reverse proxies
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*", // Set CORS_ORIGIN in .env for production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(express.json({ limit: "10mb" })); // Prevent large payload attacks

// Rate limiting - more lenient for development with ngrok
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for development
  message: { ok: false, error: "too_many_requests" },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) =>
    process.env.NODE_ENV === "development" && req.ip === "127.0.0.1",
});
app.use("/webhook", limiter);

const PORT = process.env.PORT || 3000;

// Health
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Mount webhook routes (POST /webhook)
app.use("/webhook", webhookRoutes);

// Mount Mono banking routes
app.use("/api/mono", monoRoutes);

// Mount authentication routes
app.use("/api/auth", authRoutes);

// Mount chat routes (web app)
app.use("/api/chat", chatRoutes);

// Generic error handler
app.use((err, req, res, next) => {
  console.error("Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Don't leak internal error details in production
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "internal_server_error";
  res.status(500).json({ ok: false, error: message });
});

app.listen(PORT, () => {
  console.log(
    `whatsappai prototype (MVC) listening on http://localhost:${PORT}`,
  );
});
