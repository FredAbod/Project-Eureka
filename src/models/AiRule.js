const mongoose = require("mongoose");

const aiRuleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false, // If null, it's a global rule
  },
  key: {
    type: String, // e.g., "kudi", "my_account_alias"
    required: true,
    index: true,
  },
  value: {
    type: String, // e.g., "money", "GTBank 0123456789"
    required: true,
  },
  category: {
    type: String,
    enum: ["correction", "preference", "fact"],
    default: "fact",
  },
  confidence: {
    type: Number,
    default: 1.0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast retrieval during chat
aiRuleSchema.index({ userId: 1, key: 1 });

module.exports = mongoose.model("AiRule", aiRuleSchema);
