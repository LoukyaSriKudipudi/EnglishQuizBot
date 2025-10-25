const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    chatId: { type: Number, required: true },
    userId: { type: Number, required: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    score: { type: Number, default: 0 },
    todayscore: { type: Number, default: 0 },
    totalscore: { type: Number, default: 0 },
    chatTitle: { type: String },
    totalAttempted: { type: Number, default: 0 },
    todayAttempted: { type: Number, default: 0 },
    attempted: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Ensure unique combination of chatId + userId
scoreSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Score", scoreSchema);
