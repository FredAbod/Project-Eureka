const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: String, // Can be ObjectId or just temporary ID
    required: false,
  },
  pendingTransaction: {
    type: Object,
    default: null,
  },
  metadata: {
    type: Object,
    default: {},
  },
  messages: [
    {
      role: {
        type: String,
        enum: ["user", "assistant", "system", "function", "tool"],
        required: true,
      },
      content: {
        type: String,
        required: false,
        default: null,
      },
      name: String,
      tool_calls: {
        type: mongoose.Schema.Types.Mixed,
      },
      tool_call_id: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  lastActivity: {
    type: Date,
    default: Date.now,
  },
});

sessionSchema.pre("save", function (next) {
  this.lastActivity = new Date();
  next();
});

module.exports = mongoose.model("Session", sessionSchema);
