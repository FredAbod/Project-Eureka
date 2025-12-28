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
