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
        enum: ["user", "assistant", "system", "function"],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      name: String,
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
